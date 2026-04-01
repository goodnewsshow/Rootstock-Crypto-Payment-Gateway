
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title MonthlySubscription
 * @dev A subscription management contract for monthly recurring payments using ERC20 tokens (RIF) on Rootstock
 * @notice This contract handles subscription tiers, recurring payments every 30 days using allowance-based transfers
 * @dev Each subscription stores the agreed payment amount at creation time to protect subscribers from price changes
 */
contract MonthlySubscription is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    
    // Struct to store subscription details for a user
    struct Subscription {
        bool isActive;          // Whether subscription is currently active
        uint256 startTime;      // Timestamp when subscription started
        uint256 lastPaymentTime; // Timestamp of the last payment
        uint256 nextPaymentDue;  // Timestamp when next payment is due
        uint256 paymentCount;    // Total number of payments made
        uint256 tierId;          // ID of the subscribed tier (stored for historical record)
        uint256 agreedPrice;     // Price agreed upon at subscription start (in token decimals)
        uint256 failedPaymentAttempts; // Number of consecutive failed payment attempts
        uint256 lastFailedPaymentTime; // Timestamp of the last failed payment attempt
    }
    
    // Struct to define subscription tier options
    struct Tier {
        string name;            // Name of the tier (e.g., "Basic", "Premium")
        uint256 price;          // Current price in token decimals (RIF) - for new subscribers
        bool isActive;          // Whether this tier is available for new subscriptions
        uint256 maxSubscribers; // Maximum number of subscribers allowed (0 = unlimited)
        uint256 currentSubscribers; // Current number of active subscribers
    }
    
    // Contract state variables
    IERC20 public rifToken;                 // RIF token contract address
    uint256 public constant PAYMENT_INTERVAL = 30 days;  // 30-day payment cycle
    uint256 public constant MAX_FAILED_PAYMENTS = 3;     // Max failed attempts before deactivation
    uint256 public gracePeriod = 3 days;    // Grace period before deactivation
    
    // Two-step ownership transfer variables
    address public pendingOwner;
    uint256 public pendingOwnerTimestamp;
    uint256 public constant OWNERSHIP_TRANSFER_DELAY = 2 days; // 2-day delay for security
    
    // Mappings
    mapping(address => Subscription) public subscriptions;  // User address => Subscription details
    mapping(uint256 => Tier) public tiers;                  // Tier ID => Tier details
    mapping(address => bool) public isBlacklisted;          // Blacklisted addresses
    mapping(address => uint256) public pendingPayments;     // Users with pending payments
    
    // Events
    event SubscriptionStarted(address indexed user, uint256 tierId, uint256 agreedPrice, uint256 startTime, uint256 amount);
    event PaymentProcessed(address indexed user, uint256 amount, uint256 paymentNumber, uint256 nextDueDate, uint256 currentPrice);
    event PaymentFailed(address indexed user, uint256 amount, uint256 failedAttempts);
    event SubscriptionRenewed(address indexed user, uint256 amount, uint256 paymentNumber);
    event SubscriptionCancelled(address indexed user, uint256 tierId, string reason);
    event SubscriptionDeactivated(address indexed user, uint256 tierId, string reason);
    event TierCreated(uint256 tierId, string name, uint256 price, uint256 maxSubscribers);
    event TierUpdated(uint256 tierId, string name, uint256 price, bool isActive, uint256 maxSubscribers);
    event GracePeriodUpdated(uint256 oldPeriod, uint256 newPeriod);
    event BlacklistUpdated(address indexed user, bool isBlacklisted);
    event FundsWithdrawn(address indexed owner, uint256 amount);
    event EmergencyPaused(address indexed admin);
    event EmergencyUnpaused(address indexed admin);
    event AllowanceRequested(address indexed user, uint256 tierId, uint256 requiredAmount);
    event ManualPaymentProcessed(address indexed user, uint256 amount, uint256 paymentNumber);
    event GracePeriodPaymentAttempt(address indexed user, uint256 dueTime, uint256 gracePeriodEnd);
    event PriceChangeNotified(address indexed user, uint256 oldPrice, uint256 newPrice, bool requiresAction);
    event BlacklistedUserCancelled(address indexed user, uint256 tierId);
    event CancellationDuringPause(address indexed user, uint256 tierId);
    
    // Ownership transfer events
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner, uint256 effectiveTime);
    event OwnershipTransferCancelled(address indexed previousOwner, address indexed cancelledOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    
    /**
     * @dev Constructor
     * @param _rifToken Address of the RIF token contract on Rootstock
     */
    constructor(address _rifToken) Ownable() {
        require(_rifToken != address(0), "MonthlySubscription: Invalid token address");
        rifToken = IERC20(_rifToken);
        
        // Create a default tier
        createTier("Standard", 100 * 10**18, 0); // 100 RIF per month (assuming 18 decimals)
    }
    
    /**
     * @dev Initiates ownership transfer to a new address
     * @param _newOwner Address to transfer ownership to
     */
    function transferOwnership(address _newOwner) public override onlyOwner {
        require(_newOwner != address(0), "MonthlySubscription: New owner cannot be zero address");
        require(_newOwner != owner(), "MonthlySubscription: New owner cannot be current owner");
        
        pendingOwner = _newOwner;
        pendingOwnerTimestamp = block.timestamp + OWNERSHIP_TRANSFER_DELAY;
        
        emit OwnershipTransferStarted(owner(), _newOwner, pendingOwnerTimestamp);
    }
    
    /**
     * @dev Cancels pending ownership transfer
     */
    function cancelOwnershipTransfer() public onlyOwner {
        address cancelledOwner = pendingOwner;
        require(cancelledOwner != address(0), "MonthlySubscription: No pending ownership transfer");
        
        delete pendingOwner;
        delete pendingOwnerTimestamp;
        
        emit OwnershipTransferCancelled(msg.sender, cancelledOwner);
    }
    
    /**
     * @dev Accepts ownership transfer after delay period
     */
    function acceptOwnership() external {
        require(pendingOwner == msg.sender, "MonthlySubscription: Only pending owner can accept ownership");
        require(block.timestamp >= pendingOwnerTimestamp, "MonthlySubscription: Transfer delay period not yet elapsed");
        
        address previousOwner = owner();
        
        // Transfer ownership
        _transferOwnership(pendingOwner);
        
        // Clear pending ownership state
        delete pendingOwner;
        delete pendingOwnerTimestamp;
        
        emit OwnershipTransferred(previousOwner, msg.sender);
    }
    
    /**
     * @dev Returns the pending owner address
     */
    function getPendingOwner() external view returns (address) {
        return pendingOwner;
    }
    
    /**
     * @dev Returns the timestamp when ownership transfer becomes effective
     */
    function getPendingOwnerEffectiveTime() external view returns (uint256) {
        return pendingOwnerTimestamp;
    }
    
    /**
     * @dev Creates a new subscription tier
     * @param _name Name of the tier
     * @param _price Price in token decimals (RIF)
     * @param _maxSubscribers Maximum number of subscribers (0 for unlimited)
     */
    function createTier(string memory _name, uint256 _price, uint256 _maxSubscribers) public onlyOwner {
        require(bytes(_name).length > 0, "MonthlySubscription: Name cannot be empty");
        require(_price > 0, "MonthlySubscription: Price must be greater than 0");
        
        uint256 tierId = tiers.length + 1;
        tiers[tierId] = Tier({
            name: _name,
            price: _price,
            isActive: true,
            maxSubscribers: _maxSubscribers,
            currentSubscribers: 0
        });
        
        emit TierCreated(tierId, _name, _price, _maxSubscribers);
    }
    
    /**
     * @dev Updates an existing tier
     * @notice This only affects new subscribers. Existing subscribers keep their agreed price.
     * @param _tierId ID of the tier to update
     * @param _name New name
     * @param _price New price (for new subscribers only)
     * @param _isActive Whether tier is active
     * @param _maxSubscribers New maximum subscribers
     */
    function updateTier(uint256 _tierId, string memory _name, uint256 _price, bool _isActive, uint256 _maxSubscribers) 
        public 
        onlyOwner 
    {
        require(_tierId > 0 && _tierId <= tiers.length, "MonthlySubscription: Tier does not exist");
        
        Tier storage tier = tiers[_tierId];
        uint256 oldPrice = tier.price;
        
        tier.name = _name;
        tier.price = _price;
        tier.isActive = _isActive;
        tier.maxSubscribers = _maxSubscribers;
        
        emit TierUpdated(_tierId, _name, _price, _isActive, _maxSubscribers);
        
        // Notify existing subscribers of price change (optional, doesn't affect them)
        if (oldPrice != _price) {
            emit PriceChangeNotified(address(0), oldPrice, _price, false);
        }
    }
    
    /**
     * @dev Starts a new subscription for the user using allowance pattern
     * @param _tierId ID of the tier to subscribe to
     */
    function startSubscription(uint256 _tierId) 
        external 
        nonReentrant
        whenNotPaused
        notBlacklisted
    {
        require(_tierId > 0 && _tierId <= tiers.length, "MonthlySubscription: Tier does not exist");
        require(tiers[_tierId].isActive, "MonthlySubscription: Tier is not active");
        require(!subscriptions[msg.sender].isActive, "MonthlySubscription: Already have active subscription");
        
        Tier storage tier = tiers[_tierId];
        
        // Check subscriber limit
        if (tier.maxSubscribers > 0) {
            require(tier.currentSubscribers < tier.maxSubscribers, "MonthlySubscription: Tier has reached maximum subscribers");
        }
        
        // Store the agreed price at subscription time
        uint256 agreedPrice = tier.price;
        
        // Check allowance
        uint256 allowance = rifToken.allowance(msg.sender, address(this));
        require(allowance >= agreedPrice, "MonthlySubscription: Insufficient allowance. Please approve RIF tokens");
        
        // Transfer initial payment
        rifToken.safeTransferFrom(msg.sender, address(this), agreedPrice);
        
        uint256 currentTime = block.timestamp;
        
        // Create new subscription with stored agreed price
        subscriptions[msg.sender] = Subscription({
            isActive: true,
            startTime: currentTime,
            lastPaymentTime: currentTime,
            nextPaymentDue: currentTime + PAYMENT_INTERVAL,
            paymentCount: 1,
            tierId: _tierId,
            agreedPrice: agreedPrice,
            failedPaymentAttempts: 0,
            lastFailedPaymentTime: 0
        });
        
        // Increment subscriber count
        tier.currentSubscribers++;
        
        emit SubscriptionStarted(msg.sender, _tierId, agreedPrice, currentTime, agreedPrice);
        emit PaymentProcessed(msg.sender, agreedPrice, 1, currentTime + PAYMENT_INTERVAL, agreedPrice);
    }
    
    /**
     * @dev Processes recurring payment for active subscription using allowance pattern
     * @notice Users must maintain sufficient allowance for automatic payments
     * @dev Uses the agreed price stored at subscription time, not the current tier price
     */
    function processRecurringPayment() 
        external 
        nonReentrant
        whenNotPaused
        notBlacklisted
    {
        Subscription storage sub = subscriptions[msg.sender];
        require(sub.isActive, "MonthlySubscription: No active subscription found");
        
        uint256 currentTime = block.timestamp;
        
        // Check if payment is due or within grace period
        bool isWithinGracePeriod = (currentTime >= sub.nextPaymentDue) && 
                                   (currentTime <= sub.nextPaymentDue + gracePeriod);
        
        bool isPastGracePeriod = currentTime > sub.nextPaymentDue + gracePeriod;
        
        // If past grace period, deactivate immediately
        if (isPastGracePeriod) {
            deactivateSubscription(msg.sender, "Payment overdue beyond grace period");
            return;
        }
        
        // If within grace period or exactly due, try to process payment
        if (currentTime >= sub.nextPaymentDue) {
            emit GracePeriodPaymentAttempt(msg.sender, sub.nextPaymentDue, sub.nextPaymentDue + gracePeriod);
            
            // Calculate how many payment cycles have passed
            uint256 timeElapsed = currentTime - sub.lastPaymentTime;
            uint256 paymentsDue = timeElapsed / PAYMENT_INTERVAL;
            
            require(paymentsDue > 0, "MonthlySubscription: No payments due");
            
            // Use the stored agreed price, not the current tier price
            uint256 totalAmount = paymentsDue * sub.agreedPrice;
            
            // Check allowance
            uint256 allowance = rifToken.allowance(msg.sender, address(this));
            
            if (allowance >= totalAmount) {
                // Transfer tokens
                rifToken.safeTransferFrom(msg.sender, address(this), totalAmount);
                
                // Update subscription details
                sub.lastPaymentTime = currentTime;
                sub.nextPaymentDue = currentTime + PAYMENT_INTERVAL;
                sub.paymentCount += paymentsDue;
                sub.failedPaymentAttempts = 0; // Reset failed attempts
                sub.lastFailedPaymentTime = 0;
                
                // Clear any pending payments
                if (pendingPayments[msg.sender] > 0) {
                    pendingPayments[msg.sender] = 0;
                }
                
                // Get current tier price for informational purposes
                uint256 currentTierPrice = tiers[sub.tierId].price;
                
                emit PaymentProcessed(msg.sender, totalAmount, sub.paymentCount, sub.nextPaymentDue, currentTierPrice);
                emit SubscriptionRenewed(msg.sender, totalAmount, sub.paymentCount);
                
                // If price has changed, emit notification
                if (currentTierPrice != sub.agreedPrice) {
                    emit PriceChangeNotified(msg.sender, sub.agreedPrice, currentTierPrice, false);
                }
            } else {
                // Insufficient allowance - increment failed attempts
                sub.failedPaymentAttempts++;
                sub.lastFailedPaymentTime = currentTime;
                
                emit PaymentFailed(msg.sender, totalAmount, sub.failedPaymentAttempts);
                
                // Store pending payment amount for later processing
                pendingPayments[msg.sender] += totalAmount;
                emit AllowanceRequested(msg.sender, sub.tierId, totalAmount);
                
                // Check if max failed attempts reached within grace period
                if (sub.failedPaymentAttempts >= MAX_FAILED_PAYMENTS) {
                    deactivateSubscription(msg.sender, "Max failed payment attempts reached");
                }
            }
        } else {
            // Payment not due yet
            revert("MonthlySubscription: Payment is not due yet");
        }
    }
    
    /**
     * @dev Allows users to manually process pending payments after increasing allowance
     * @notice Uses the stored agreed price for calculating payment counts
     */
    function processPendingPayments() 
        external 
        nonReentrant
        whenNotPaused
        notBlacklisted
    {
        Subscription storage sub = subscriptions[msg.sender];
        require(sub.isActive, "MonthlySubscription: No active subscription found");
        require(pendingPayments[msg.sender] > 0, "MonthlySubscription: No pending payments");
        
        uint256 currentTime = block.timestamp;
        
        // Check if within grace period or if subscription should still be active
        bool isWithinGracePeriod = (currentTime >= sub.nextPaymentDue) && 
                                   (currentTime <= sub.nextPaymentDue + gracePeriod);
        
        bool isPastGracePeriod = currentTime > sub.nextPaymentDue + gracePeriod;
        
        // If past grace period, deactivate and don't process pending payments
        if (isPastGracePeriod) {
            deactivateSubscription(msg.sender, "Subscription deactivated due to overdue payments");
            revert("MonthlySubscription: Subscription deactivated due to overdue payments");
        }
        
        uint256 pendingAmount = pendingPayments[msg.sender];
        uint256 allowance = rifToken.allowance(msg.sender, address(this));
        require(allowance >= pendingAmount, "MonthlySubscription: Insufficient allowance for pending payments");
        
        // Transfer pending payment
        rifToken.safeTransferFrom(msg.sender, address(this), pendingAmount);
        
        // Update subscription - use stored agreed price
        uint256 paymentsMade = pendingAmount / sub.agreedPrice;
        sub.paymentCount += paymentsMade;
        sub.failedPaymentAttempts = 0;
        sub.lastFailedPaymentTime = 0;
        
        // If within grace period and we processed pending payments, also update nextPaymentDue if needed
        if (currentTime >= sub.nextPaymentDue) {
            sub.lastPaymentTime = currentTime;
            sub.nextPaymentDue = currentTime + PAYMENT_INTERVAL;
        }
        
        pendingPayments[msg.sender] = 0;
        
        uint256 currentTierPrice = tiers[sub.tierId].price;
        
        emit ManualPaymentProcessed(msg.sender, pendingAmount, sub.paymentCount);
        emit PaymentProcessed(msg.sender, pendingAmount, sub.paymentCount, sub.nextPaymentDue, currentTierPrice);
        
        // If price has changed, emit notification
        if (currentTierPrice != sub.agreedPrice) {
            emit PriceChangeNotified(msg.sender, sub.agreedPrice, currentTierPrice, false);
        }
    }
    
    /**
     * @dev Centralized deactivation logic that handles all subscription deactivations
     * @param _user Address of the user to deactivate
     * @param _reason Reason for deactivation
     */
    function deactivateSubscription(address _user, string memory _reason) internal {
        Subscription storage sub = subscriptions[_user];
        require(sub.isActive, "MonthlySubscription: Subscription already inactive");
        
        uint256 tierId = sub.tierId;
        
        // Deactivate the subscription
        sub.isActive = false;
        
        // Clear any pending payments
        if (pendingPayments[_user] > 0) {
            pendingPayments[_user] = 0;
        }
        
        // Decrement subscriber count for the tier (centralized accounting)
        Tier storage tier = tiers[tierId];
        require(tier.currentSubscribers > 0, "MonthlySubscription: Subscriber count inconsistency detected");
        tier.currentSubscribers--;
        
        emit SubscriptionCancelled(_user, tierId, _reason);
        emit SubscriptionDeactivated(_user, tierId, _reason);
    }
    
    /**
     * @dev Allows user to cancel their subscription
     * @notice This function is exempt from the whenNotPaused modifier to allow cancellations during emergencies
     * @notice Also exempt from notBlacklisted modifier to allow blacklisted users to cancel
     */
    function cancelSubscription() 
        external 
        nonReentrant
    {
        require(subscriptions[msg.sender].isActive, "MonthlySubscription: No active subscription found");
        
        // Check if contract is paused
        bool isPaused = paused();
        
        // Check if user is blacklisted
        if (isBlacklisted[msg.sender]) {
            // Blacklisted user cancelling - special handling
            uint256 tierId = subscriptions[msg.sender].tierId;
            deactivateSubscription(msg.sender, "Blacklisted user cancelled subscription");
            emit BlacklistedUserCancelled(msg.sender, tierId);
            if (isPaused) {
                emit CancellationDuringPause(msg.sender, tierId);
            }
        } else {
            // Normal user cancellation
            deactivateSubscription(msg.sender, "User cancelled subscription");
            if (isPaused) {
                emit CancellationDuringPause(msg.sender, subscriptions[msg.sender].tierId);
            }
        }
    }
    
    /**
     * @dev Admin function to deactivate a subscription (for emergencies)
     * @notice This function is exempt from the whenNotPaused modifier to allow admin actions during emergencies
     * @param _user Address of the user to deactivate
     */
    function adminDeactivateSubscription(address _user) 
        external 
        onlyOwner 
        nonReentrant
    {
        require(subscriptions[_user].isActive, "MonthlySubscription: User has no active subscription");
        
        bool isPaused = paused();
        uint256 tierId = subscriptions[_user].tierId;
        
        deactivateSubscription(_user, "Admin deactivated");
        
        if (isPaused) {
            emit CancellationDuringPause(_user, tierId);
        }
    }
    
    /**
     * @dev Allows users to upgrade to current tier price (optional)
     * @notice This updates the subscriber's agreed price to the current tier price
     */
    function upgradeToCurrentPrice() external nonReentrant whenNotPaused notBlacklisted {
        Subscription storage sub = subscriptions[msg.sender];
        require(sub.isActive, "MonthlySubscription: No active subscription found");
        
        uint256 currentPrice = tiers[sub.tierId].price;
        require(currentPrice != sub.agreedPrice, "MonthlySubscription: Already at current price");
        require(currentPrice > sub.agreedPrice, "MonthlySubscription: Cannot downgrade price automatically");
        
        uint256 oldPrice = sub.agreedPrice;
        sub.agreedPrice = currentPrice;
        
        emit PriceChangeNotified(msg.sender, oldPrice, currentPrice, true);
    }
    
    /**
     * @dev Updates grace period
     * @param _newGracePeriod New grace period in seconds
     */
    function setGracePeriod(uint256 _newGracePeriod) external onlyOwner {
        require(_newGracePeriod <= 30 days, "MonthlySubscription: Grace period cannot exceed 30 days");
        uint256 oldPeriod = gracePeriod;
        gracePeriod = _newGracePeriod;
        emit GracePeriodUpdated(oldPeriod, _newGracePeriod);
    }
    
    /**
     * @dev Checks if a subscription is active (considering grace period)
     * @param _user Address to check
     * @return bool indicating if subscription is active
     */
    function isSubscriptionActive(address _user) public view returns (bool) {
        Subscription storage sub = subscriptions[_user];
        
        // Check if subscription exists and is active
        if (!sub.isActive) return false;
        
        // Check if payment is due
        uint256 currentTime = block.timestamp;
        
        // If payment is not due yet, subscription is definitely active
        if (currentTime <= sub.nextPaymentDue) {
            return true;
        }
        
        // Payment is overdue, check if within grace period
        uint256 timeSinceDue = currentTime - sub.nextPaymentDue;
        return timeSinceDue <= gracePeriod;
    }
    
    /**
     * @dev Gets the remaining grace period time for a user
     * @param _user Address to check
     * @return remainingSeconds Seconds remaining in grace period (0 if no active subscription or not in grace period)
     */
    function getRemainingGracePeriod(address _user) external view returns (uint256) {
        Subscription storage sub = subscriptions[_user];
        if (!sub.isActive) return 0;
        
        uint256 currentTime = block.timestamp;
        if (currentTime <= sub.nextPaymentDue) return 0;
        
        uint256 timeSinceDue = currentTime - sub.nextPaymentDue;
        if (timeSinceDue >= gracePeriod) return 0;
        
        return gracePeriod - timeSinceDue;
    }
    
    /**
     * @dev Gets subscription details for a user
     * @param _user Address to query
     * @return tierId Tier ID
     * @return isActive Whether subscription is active
     * @return startTime Start timestamp
     * @return lastPaymentTime Last payment timestamp
     * @return nextPaymentDue Next payment due timestamp
     * @return paymentCount Number of payments made
     * @return agreedPrice Price agreed at subscription start
     * @return currentPrice Current price of the tier
     * @return tierName Name of the tier
     * @return failedPaymentAttempts Number of failed payment attempts
     * @return lastFailedPaymentTime Timestamp of last failed attempt
     */
    function getSubscriptionDetails(address _user) 
        external 
        view 
        returns (
            uint256 tierId,
            bool isActive,
            uint256 startTime,
            uint256 lastPaymentTime,
            uint256 nextPaymentDue,
            uint256 paymentCount,
            uint256 agreedPrice,
            uint256 currentPrice,
            string memory tierName,
            uint256 failedPaymentAttempts,
            uint256 lastFailedPaymentTime
        ) 
    {
        Subscription storage sub = subscriptions[_user];
        require(sub.isActive, "MonthlySubscription: No active subscription");
        
        Tier storage tier = tiers[sub.tierId];
        
        return (
            sub.tierId,
            sub.isActive,
            sub.startTime,
            sub.lastPaymentTime,
            sub.nextPaymentDue,
            sub.paymentCount,
            sub.agreedPrice,
            tier.price,
            tier.name,
            sub.failedPaymentAttempts,
            sub.lastFailedPaymentTime
        );
    }
    
    /**
     * @dev Gets upcoming payment details
     * @param _user Address to query
     * @return amount Amount due (based on agreed price)
     * @return dueTime Timestamp when payment is due
     * @return requiredAllowance Required allowance for automatic payment
     * @return gracePeriodEnd Timestamp when grace period ends
     * @return agreedPrice Stored price for this subscriber
     * @return currentPrice Current tier price for comparison
     */
    function getUpcomingPayment(address _user) external view returns (
        uint256 amount, 
        uint256 dueTime,
        uint256 requiredAllowance,
        uint256 gracePeriodEnd,
        uint256 agreedPrice,
        uint256 currentPrice
    ) {
        Subscription storage sub = subscriptions[_user];
        if (!sub.isActive) return (0, 0, 0, 0, 0, 0);
        
        uint256 pendingAmount = pendingPayments[_user];
        uint256 totalRequired = sub.agreedPrice + pendingAmount;
        
        return (
            sub.agreedPrice,
            sub.nextPaymentDue,
            totalRequired,
            sub.nextPaymentDue + gracePeriod,
            sub.agreedPrice,
            tiers[sub.tierId].price
        );
    }
    
    /**
     * @dev Gets tier details including current price
     * @param _tierId ID of the tier
     * @return name Tier name
     * @return price Current price in token decimals
     * @return isActive Whether tier is active
     * @return maxSubscribers Maximum subscribers
     * @return currentSubscribers Current subscriber count
     */
    function getTierDetails(uint256 _tierId) external view returns (
        string memory name,
        uint256 price,
        bool isActive,
        uint256 maxSubscribers,
        uint256 currentSubscribers
    ) {
        require(_tierId > 0 && _tierId <= tiers.length, "MonthlySubscription: Tier does not exist");
        Tier storage tier = tiers[_tierId];
        return (tier.name, tier.price, tier.isActive, tier.maxSubscribers, tier.currentSubscribers);
    }
    
    /**
     * @dev Gets the total number of active subscribers across all tiers
     * @return totalActiveSubscribers Total count
     */
    function getTotalActiveSubscribers() external view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 1; i <= tiers.length; i++) {
            total += tiers[i].currentSubscribers;
        }
        return total;
    }
    
    /**
     * @dev Checks if a user is blacklisted
     * @param _user Address to check
     * @return bool indicating if user is blacklisted
     */
    function isUserBlacklisted(address _user) external view returns (bool) {
        return isBlacklisted[_user];
    }
    
    /**
     * @dev Blacklists or unblacklists an address
     * @param _user Address to blacklist/unblacklist
     * @param _blacklist True to blacklist, false to unblacklist
     */
    function setBlacklist(address _user, bool _blacklist) external onlyOwner {
        isBlacklisted[_user] = _blacklist;
        emit BlacklistUpdated(_user, _blacklist);
    }
    
    /**
     * @dev Withdraws RIF tokens from contract to owner
     */
    function withdrawTokens() external onlyOwner {
        uint256 balance = rifToken.balanceOf(address(this));
        require(balance > 0, "MonthlySubscription: No balance to withdraw");
        
        rifToken.safeTransfer(owner(), balance);
        emit FundsWithdrawn(owner(), balance);
    }
    
    /**
     * @dev Gets contract RIF token balance
     * @return Token balance
     */
    function getContractBalance() external view returns (uint256) {
        return rifToken.balanceOf(address(this));
    }
    
    /**
     * @dev Pauses all subscription operations
     */
    function pause() external onlyOwner {
        _pause();
        emit EmergencyPaused(msg.sender);
    }
    
    /**
     * @dev Unpauses all subscription operations
     */
    function unpause() external onlyOwner {
        _unpause();
        emit EmergencyUnpaused(msg.sender);
    }
    
    // Modifiers
    modifier notBlacklisted() {
        require(!isBlacklisted[msg.sender], "MonthlySubscription: Address is blacklisted");
        _;
    }
}
