// Sources flattened with hardhat v2.28.6 https://hardhat.org

// SPDX-License-Identifier: MIT

// File src/interfaces/IERC20.sol

pragma solidity ^0.8.20;

/**
 * @title IERC20
 * @dev Standard ERC-20 interface used to interact with the RIF token on Rootstock.
 * RIF token address on Rootstock Mainnet: 0x2aCc95758f8b5F583470bA265Eb685a8f45fC9D
 * RIF token address on Rootstock Testnet:  0x19F64674D8A5B4E652319F5e239eFd3bc969A1fE
 */
interface IERC20 {
    /**
     * @dev Returns the total token supply.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the token balance of `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Transfers `amount` tokens to `recipient`.
     * Returns a boolean indicating success.
     */
    function transfer(address recipient, uint256 amount) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` is allowed
     * to spend on behalf of `owner`.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets `amount` as the allowance of `spender` over the caller's tokens.
     * Returns a boolean indicating success.
     */
    function approve(address spender, uint256 amount) external returns (bool);

    /**
     * @dev Moves `amount` tokens from `sender` to `recipient` using the allowance
     * mechanism. `amount` is then deducted from the caller's allowance.
     * Returns a boolean indicating success.
     */
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}


// File src/RIFSubscription.sol


/**
 * @title RIFSubscription
 * @author Your Team
 * @notice A subscription contract that enables recurring payments every 30 days
 *         using the RIF token on the Rootstock blockchain.
 *
 * @dev How it works:
 *   1. The contract owner (service provider) deploys this contract specifying
 *      the monthly price in RIF tokens.
 *   2. Subscribers approve this contract to spend RIF tokens on their behalf
 *      (via RIF.approve(subscriptionContractAddress, amount)).
 *   3. Subscribers call `subscribe()` to start their subscription. The first
 *      payment is charged immediately.
 *   4. Anyone can call `chargeSubscriber(address)` after 30 days have passed
 *      since the last payment to trigger the next billing cycle.
 *   5. If a charge fails (insufficient balance or allowance), the subscription
 *      is automatically cancelled.
 *   6. Subscribers can cancel at any time by calling `cancelSubscription()`.
 *   7. The owner can withdraw accumulated RIF tokens via `withdrawFunds()`.
 *
 * RIF Token addresses:
 *   - Rootstock Mainnet: 0x2aCc95758f8b5F583470bA265Eb685a8f45fC9D
 *   - Rootstock Testnet: 0x19F64674D8A5B4E652319F5e239eFd3bc969A1fE
 */
contract RIFSubscription {
    // -------------------------------------------------------------------------
    // State variables
    // -------------------------------------------------------------------------

    /// @notice The ERC-20 RIF token contract.
    IERC20 public immutable rifToken;

    /// @notice Address that receives all subscription payments.
    address public owner;

    /// @notice Price per subscription cycle in RIF tokens (in the token's smallest unit, i.e. 1e18 = 1 RIF).
    uint256 public subscriptionPrice;

    /// @notice Duration of each billing cycle (30 days in seconds).
    uint256 public constant BILLING_CYCLE = 30 days;

    // -------------------------------------------------------------------------
    // Data structures
    // -------------------------------------------------------------------------

    struct Subscription {
        bool active;
        uint256 startTime; // Timestamp when the subscription was created
        uint256 lastPaymentTime; // Timestamp of the most recent successful charge
        uint256 nextPaymentTime; // Timestamp when the next charge becomes due
    }

    /// @notice Maps each subscriber address to their subscription details.
    mapping(address => Subscription) public subscriptions;

    /// @notice List of all current subscriber addresses (used for iteration).
    address[] private subscriberList;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when a new subscription is created.
    event Subscribed(address indexed subscriber, uint256 timestamp);

    /// @notice Emitted when a recurring payment is collected successfully.
    event PaymentCollected(address indexed subscriber, uint256 amount, uint256 timestamp);

    /// @notice Emitted when a subscription is cancelled (by the subscriber or due to failed payment).
    event SubscriptionCancelled(address indexed subscriber, uint256 timestamp);

    /// @notice Emitted when a charge attempt fails due to insufficient balance or allowance.
    event PaymentFailed(address indexed subscriber, uint256 timestamp);

    /// @notice Emitted when the owner withdraws accumulated funds.
    event FundsWithdrawn(address indexed owner, uint256 amount, uint256 timestamp);

    /// @notice Emitted when the subscription price is updated.
    event PriceUpdated(uint256 oldPrice, uint256 newPrice);

    /// @notice Emitted when contract ownership is transferred.
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyOwner() {
        require(msg.sender == owner, "RIFSubscription: caller is not the owner");
        _;
    }

    modifier onlyActiveSubscriber() {
        require(subscriptions[msg.sender].active, "RIFSubscription: no active subscription");
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /**
     * @notice Deploys the subscription contract.
     * @param _rifToken  Address of the RIF ERC-20 token contract on Rootstock.
     * @param _price     Monthly subscription price in RIF tokens (use 1e18 units, e.g. 1 RIF = 1000000000000000000).
     */
    constructor(address _rifToken, uint256 _price) {
        require(_rifToken != address(0), "RIFSubscription: invalid token address");
        require(_price > 0, "RIFSubscription: price must be greater than zero");

        rifToken = IERC20(_rifToken);
        subscriptionPrice = _price;
        owner = msg.sender;
    }

    // -------------------------------------------------------------------------
    // Subscriber-facing functions
    // -------------------------------------------------------------------------

    /**
     * @notice Subscribe to the service. Charges the first payment immediately.
     *
     * @dev Before calling this function the subscriber must have called
     *      `RIFToken.approve(address(this), amount)` with at least
     *      `subscriptionPrice` tokens approved.
     *
     *      Reverts if:
     *        - The caller already has an active subscription.
     *        - The contract cannot transfer the first payment (insufficient balance / allowance).
     */
    function subscribe() external {
        require(!subscriptions[msg.sender].active, "RIFSubscription: already subscribed");

        // Collect the first payment upfront
        bool success = rifToken.transferFrom(msg.sender, address(this), subscriptionPrice);
        require(
            success,
            "RIFSubscription: initial payment failed - check RIF balance and allowance"
        );

        uint256 currentTime = block.timestamp;

        subscriptions[msg.sender] = Subscription({
            active: true,
            startTime: currentTime,
            lastPaymentTime: currentTime,
            nextPaymentTime: currentTime + BILLING_CYCLE
        });

        subscriberList.push(msg.sender);

        emit Subscribed(msg.sender, currentTime);
        emit PaymentCollected(msg.sender, subscriptionPrice, currentTime);
    }

    /**
     * @notice Cancel the caller's own active subscription.
     *
     * @dev The subscription is marked inactive immediately. No refund is issued
     *      for the current billing period — the subscriber retains access until
     *      the end of the period they already paid for (off-chain enforcement).
     */
    function cancelSubscription() external onlyActiveSubscriber {
        _cancelSubscription(msg.sender);
    }

    // -------------------------------------------------------------------------
    // Billing / charging functions
    // -------------------------------------------------------------------------

    /**
     * @notice Charge a subscriber for their next billing cycle.
     *
     * @dev Can be called by anyone (keeper, automation, or the subscriber themselves)
     *      once 30 days have elapsed since the last payment. If the charge fails
     *      (e.g. the subscriber revoked their allowance or ran out of tokens),
     *      the subscription is automatically cancelled.
     *
     * @param subscriber Address of the subscriber to charge.
     */
    function chargeSubscriber(address subscriber) external {
        Subscription storage sub = subscriptions[subscriber];

        require(sub.active, "RIFSubscription: subscriber has no active subscription");
        require(
            block.timestamp >= sub.nextPaymentTime,
            "RIFSubscription: billing cycle not yet due"
        );

        uint256 currentTime = block.timestamp;

        // Attempt to transfer the subscription fee
        bool success = _tryTransfer(subscriber, subscriptionPrice);

        if (success) {
            sub.lastPaymentTime = currentTime;
            sub.nextPaymentTime = currentTime + BILLING_CYCLE;

            emit PaymentCollected(subscriber, subscriptionPrice, currentTime);
        } else {
            // Cancel the subscription if payment cannot be collected
            emit PaymentFailed(subscriber, currentTime);
            _cancelSubscription(subscriber);
        }
    }

    /**
     * @notice Batch-charge multiple subscribers in a single transaction.
     *
     * @dev Useful for automated keepers or scripts that process renewals in bulk.
     *      Continues even if individual charges fail (failed subscribers get cancelled).
     *
     * @param subscribers Array of subscriber addresses to charge.
     */
    function chargeSubscribers(address[] calldata subscribers) external {
        for (uint256 i = 0; i < subscribers.length; i++) {
            address subscriber = subscribers[i];
            Subscription storage sub = subscriptions[subscriber];

            if (!sub.active) continue;
            if (block.timestamp < sub.nextPaymentTime) continue;

            uint256 currentTime = block.timestamp;
            bool success = _tryTransfer(subscriber, subscriptionPrice);

            if (success) {
                sub.lastPaymentTime = currentTime;
                sub.nextPaymentTime = currentTime + BILLING_CYCLE;
                emit PaymentCollected(subscriber, subscriptionPrice, currentTime);
            } else {
                emit PaymentFailed(subscriber, currentTime);
                _cancelSubscription(subscriber);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Owner-only management functions
    // -------------------------------------------------------------------------

    /**
     * @notice Withdraw all RIF tokens accumulated in this contract to the owner's address.
     */
    function withdrawFunds() external onlyOwner {
        uint256 balance = rifToken.balanceOf(address(this));
        require(balance > 0, "RIFSubscription: no funds to withdraw");

        bool success = rifToken.transfer(owner, balance);
        require(success, "RIFSubscription: withdrawal transfer failed");

        emit FundsWithdrawn(owner, balance, block.timestamp);
    }

    /**
     * @notice Update the subscription price for future billing cycles.
     *
     * @dev Existing subscribers continue to be charged the price that was active
     *      when they subscribed until their next renewal — or implement off-chain
     *      migration logic as needed.
     *
     * @param newPrice New monthly price in RIF token units (1e18 = 1 RIF).
     */
    function setSubscriptionPrice(uint256 newPrice) external onlyOwner {
        require(newPrice > 0, "RIFSubscription: price must be greater than zero");
        uint256 oldPrice = subscriptionPrice;
        subscriptionPrice = newPrice;
        emit PriceUpdated(oldPrice, newPrice);
    }

    /**
     * @notice Transfer contract ownership to a new address.
     * @param newOwner Address of the new owner.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "RIFSubscription: new owner is the zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /**
     * @notice Forcibly cancel a subscriber's subscription (e.g. for ToS violations).
     * @param subscriber Address of the subscriber to cancel.
     */
    function forceCancel(address subscriber) external onlyOwner {
        require(subscriptions[subscriber].active, "RIFSubscription: subscriber is not active");
        _cancelSubscription(subscriber);
    }

    // -------------------------------------------------------------------------
    // View / read functions
    // -------------------------------------------------------------------------

    /**
     * @notice Check whether an address currently has an active subscription.
     * @param subscriber Address to query.
     * @return True if the subscription is active, false otherwise.
     */
    function isSubscribed(address subscriber) external view returns (bool) {
        return subscriptions[subscriber].active;
    }

    /**
     * @notice Returns the number of seconds until the next payment is due for a subscriber.
     *         Returns 0 if the payment is already overdue or the subscription is inactive.
     * @param subscriber Address to query.
     */
    function timeUntilNextPayment(address subscriber) external view returns (uint256) {
        Subscription storage sub = subscriptions[subscriber];
        if (!sub.active) return 0;
        if (block.timestamp >= sub.nextPaymentTime) return 0;
        return sub.nextPaymentTime - block.timestamp;
    }

    /**
     * @notice Returns the full list of subscriber addresses (active and historical).
     *         Use `isSubscribed()` to filter for currently active subscribers.
     */
    function getSubscriberList() external view returns (address[] memory) {
        return subscriberList;
    }

    /**
     * @notice Returns subscription details for a given address.
     * @param subscriber Address to query.
     * @return active          Whether the subscription is currently active.
     * @return startTime       Unix timestamp when the subscription was created.
     * @return lastPaymentTime Unix timestamp of the most recent successful charge.
     * @return nextPaymentTime Unix timestamp when the next charge becomes due.
     */
    function getSubscription(
        address subscriber
    )
        external
        view
        returns (bool active, uint256 startTime, uint256 lastPaymentTime, uint256 nextPaymentTime)
    {
        Subscription storage sub = subscriptions[subscriber];
        return (sub.active, sub.startTime, sub.lastPaymentTime, sub.nextPaymentTime);
    }

    /**
     * @notice Returns the RIF token balance held by this contract (uncollected payments).
     */
    function contractBalance() external view returns (uint256) {
        return rifToken.balanceOf(address(this));
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /**
     * @dev Attempt a transferFrom without reverting. Returns false on failure.
     *      Uses a low-level call so that a revert inside the token does not
     *      bubble up and cancel an entire batch charge.
     */
    function _tryTransfer(address from, uint256 amount) internal returns (bool) {
        // Check allowance and balance before attempting transfer
        uint256 allowance = rifToken.allowance(from, address(this));
        uint256 balance = rifToken.balanceOf(from);

        if (allowance < amount || balance < amount) {
            return false;
        }

        try rifToken.transferFrom(from, address(this), amount) returns (bool result) {
            return result;
        } catch {
            return false;
        }
    }

    /**
     * @dev Marks a subscription as inactive and emits the cancellation event.
     *      Does NOT remove the subscriber from `subscriberList` to avoid unbounded
     *      gas costs — use `getSubscriberList()` + `isSubscribed()` to filter.
     */
    function _cancelSubscription(address subscriber) internal {
        subscriptions[subscriber].active = false;
        emit SubscriptionCancelled(subscriber, block.timestamp);
    }
}
