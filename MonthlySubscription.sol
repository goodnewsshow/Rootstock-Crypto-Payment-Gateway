// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title MonthlySubscription
 * @dev A subscription management contract for monthly recurring payments in rBTC on Rootstock
 * @notice This contract handles subscription tiers, recurring payments every 30 days, and automatic deactivation for insufficient funds
 */
contract MonthlySubscription {
    // Struct to store subscription details for a user
    struct Subscription {
        bool isActive;          // Whether subscription is currently active
        uint256 startTime;      // Timestamp when subscription started
        uint256 lastPaymentTime; // Timestamp of the last payment
        uint256 nextPaymentDue;  // Timestamp when next payment is due
        uint256 paymentCount;    // Total number of payments made
        uint256 tierId;          // ID of the subscribed tier (stored for historical record)
    }
    
    // Struct to define subscription tier options
    struct Tier {
        string name;            // Name of the tier (e.g., "Basic", "Premium")
        uint256 price;          // Price in wei (rBTC)
        bool isActive;          // Whether this tier is available for new subscriptions
        uint256 maxSubscribers; // Maximum number of subscribers allowed (0 = unlimited)
        uint256 currentSubscribers; // Current number of active subscribers
    }
    
    // Contract state variables
    address public owner;                       // Contract owner address
    uint256 public constant PAYMENT_INTERVAL = 30 days;  // 30-day payment cycle
    uint256 public gracePeriod = 3 days;        // Grace period before deactivation
    uint256 public nextTierId;                  // Next available tier ID
    
    // Mappings
    mapping(address => Subscription) public subscriptions;  // User address => Subscription details
    mapping(uint256 => Tier) public tiers;                  // Tier ID => Tier details
    mapping(address => bool) public isBlacklisted;          // Blacklisted addresses
    
    // Events
    event SubscriptionStarted(address indexed user, uint256 tierId, uint256 startTime, uint256 amount);
    event PaymentProcessed(address indexed user, uint256 amount, uint256 paymentNumber, uint256 nextDueDate);
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
    
    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "MonthlySubscription: Only owner can call this function");
        _;
    }
    
    modifier notBlacklisted() {
        require(!isBlacklisted[msg.sender], "MonthlySubscription: Address is blacklisted");
        _;
    }
    
    modifier whenNotPaused() {
        require(!paused, "MonthlySubscription: Contract is paused");
        _;
    }
    
    // Emergency pause mechanism
    bool public paused;
    
    constructor() {
        owner = msg.sender;
        nextTierId = 1;
        paused = false;
        
        // Create a default tier
        createTier("Standard", 0.01 ether, 0); // 0.01 rBTC per month, unlimited subscribers
    }
    
    /**
     * @dev Creates a new subscription tier
     * @param _name Name of the tier
     * @param _price Price in wei (rBTC)
     * @param _maxSubscribers Maximum number of subscribers (0 for unlimited)
     */
    function createTier(string memory _name, uint256 _price, uint256 _maxSubscribers) public onlyOwner {
        require(bytes(_name).length > 0, "MonthlySubscription: Name cannot be empty");
        require(_price > 0, "MonthlySubscription: Price must be greater than 0");
        
        tiers[nextTierId] = Tier({
            name: _name,
            price: _price,
            isActive: true,
            maxSubscribers: _maxSubscribers,
            currentSubscribers: 0
        });
        
        emit TierCreated(nextTierId, _name, _price, _maxSubscribers);
        nextTierId++;
    }
    
    /**
     * @dev Updates an existing tier
     * @param _tierId ID of the tier to update
     * @param _name New name
     * @param _price New price
     * @param _isActive Whether tier is active
     * @param _maxSubscribers New maximum subscribers
     */
    function updateTier(uint256 _tierId, string memory _name, uint256 _price, bool _isActive, uint256 _maxSubscribers) 
        public 
        onlyOwner 
    {
        require(_tierId > 0 && _tierId < nextTierId, "MonthlySubscription: Tier does not exist");
        
        Tier storage tier = tiers[_tierId];
        tier.name = _name;
        tier.price = _price;
        tier.isActive = _isActive;
        tier.maxSubscribers = _maxSubscribers;
        
        emit TierUpdated(_tierId, _name, _price, _isActive, _maxSubscribers);
    }
    
    /**
     * @dev Starts a new subscription for the user
     * @param _tierId ID of the tier to subscribe to
     */
    function startSubscription(uint256 _tierId) 
        external 
        payable 
        notBlacklisted 
        whenNotPaused 
    {
        require(_tierId > 0 && _tierId < nextTierId, "MonthlySubscription: Tier does not exist");
        require(tiers[_tierId].isActive, "MonthlySubscription: Tier is not active");
        require(!subscriptions[msg.sender].isActive, "MonthlySubscription: Already have active subscription");
        
        Tier storage tier = tiers[_tierId];
        
        // Check subscriber limit
        if (tier.maxSubscribers > 0) {
            require(tier.currentSubscribers < tier.maxSubscribers, "MonthlySubscription: Tier has reached maximum subscribers");
        }
        
        // Check if user has enough funds
        require(msg.value == tier.price, "MonthlySubscription: Incorrect payment amount");
        
        uint256 currentTime = block.timestamp;
        
        // Create new subscription
        subscriptions[msg.sender] = Subscription({
            isActive: true,
            startTime: currentTime,
            lastPaymentTime: currentTime,
            nextPaymentDue: currentTime + PAYMENT_INTERVAL,
            paymentCount: 1,
            tierId: _tierId
        });
        
        // Increment subscriber count
        tier.currentSubscribers++;
        
        emit SubscriptionStarted(msg.sender, _tierId, currentTime, msg.value);
        emit PaymentProcessed(msg.sender, msg.value, 1, currentTime + PAYMENT_INTERVAL);
    }
    
    /**
     * @dev Processes recurring payment for active subscription
     * @notice Users can call this manually or it can be automated via keepers
     */
    function processRecurringPayment() 
        external 
        notBlacklisted 
        whenNotPaused 
    {
        Subscription storage sub = subscriptions[msg.sender];
        require(sub.isActive, "MonthlySubscription: No active subscription found");
        
        uint256 currentTime = block.timestamp;
        require(currentTime >= sub.nextPaymentDue, "MonthlySubscription: Payment is not due yet");
        
        // Calculate how many payment cycles have passed
        uint256 timeElapsed = currentTime - sub.lastPaymentTime;
        uint256 paymentsDue = timeElapsed / PAYMENT_INTERVAL;
        
        require(paymentsDue > 0, "MonthlySubscription: No payments due");
        
        Tier storage tier = tiers[sub.tierId];
        uint256 totalAmount = paymentsDue * tier.price;
        
        // Check if user has enough balance
        if (address(msg.sender).balance >= totalAmount) {
            // Transfer funds from user to contract
            (bool success, ) = payable(address(this)).call{value: totalAmount}("");
            require(success, "MonthlySubscription: Payment transfer failed");
            
            // Update subscription details
            sub.lastPaymentTime = currentTime;
            sub.nextPaymentDue = currentTime + PAYMENT_INTERVAL;
            sub.paymentCount += paymentsDue;
            
            emit PaymentProcessed(msg.sender, totalAmount, sub.paymentCount, sub.nextPaymentDue);
            emit SubscriptionRenewed(msg.sender, totalAmount, sub.paymentCount);
        } else {
            // Insufficient funds - deactivate subscription
            uint256 tierId = sub.tierId;
            deactivateSubscription(msg.sender, "Insufficient funds for recurring payment");
            tiers[tierId].currentSubscribers--;
            
            emit SubscriptionDeactivated(msg.sender, tierId, "Insufficient funds for recurring payment");
        }
    }
    
    /**
     * @dev Internal function to deactivate a subscription
     * @param _user Address of the user
     * @param _reason Reason for deactivation
     */
    function deactivateSubscription(address _user, string memory _reason) internal {
        Subscription storage sub = subscriptions[_user];
        require(sub.isActive, "MonthlySubscription: Subscription already inactive");
        
        uint256 tierId = sub.tierId;
        sub.isActive = false;
        
        emit SubscriptionCancelled(_user, tierId, _reason);
    }
    
    /**
     * @dev Allows user to cancel their subscription
     */
    function cancelSubscription() external notBlacklisted whenNotPaused {
        require(subscriptions[msg.sender].isActive, "MonthlySubscription: No active subscription found");
        
        uint256 tierId = subscriptions[msg.sender].tierId;
        deactivateSubscription(msg.sender, "User cancelled subscription");
        tiers[tierId].currentSubscribers--;
        
        emit SubscriptionDeactivated(msg.sender, tierId, "User cancelled subscription");
    }
    
    /**
     * @dev Admin function to deactivate a subscription (for emergencies)
     * @param _user Address of the user to deactivate
     */
    function adminDeactivateSubscription(address _user) external onlyOwner whenNotPaused {
        require(subscriptions[_user].isActive, "MonthlySubscription: User has no active subscription");
        
        uint256 tierId = subscriptions[_user].tierId;
        deactivateSubscription(_user, "Admin deactivated");
        tiers[tierId].currentSubscribers--;
        
        emit SubscriptionDeactivated(_user, tierId, "Admin deactivated");
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
        if (!sub.isActive) return false;
        
        // Check if subscription is still within grace period
        uint256 timeSinceDue = block.timestamp - sub.nextPaymentDue;
        if (timeSinceDue > gracePeriod) return false;
        
        return true;
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
     * @return price Current price of the tier
     * @return tierName Name of the tier
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
            uint256 price,
            string memory tierName
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
            tier.price,
            tier.name
        );
    }
    
    /**
     * @dev Gets upcoming payment details
     * @param _user Address to query
     * @return amount Amount due
     * @return dueTime Timestamp when payment is due
     */
    function getUpcomingPayment(address _user) external view returns (uint256 amount, uint256 dueTime) {
        Subscription storage sub = subscriptions[_user];
        if (!sub.isActive) return (0, 0);
        
        Tier storage tier = tiers[sub.tierId];
        return (tier.price, sub.nextPaymentDue);
    }
    
    /**
     * @dev Gets tier details
     * @param _tierId ID of the tier
     * @return name Tier name
     * @return price Price in wei
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
        require(_tierId > 0 && _tierId < nextTierId, "MonthlySubscription: Tier does not exist");
        Tier storage tier = tiers[_tierId];
        return (tier.name, tier.price, tier.isActive, tier.maxSubscribers, tier.currentSubscribers);
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
     * @dev Pauses all subscription operations
     */
    function pause() external onlyOwner {
        paused = true;
        emit EmergencyPaused(msg.sender);
    }
    
    /**
     * @dev Unpauses all subscription operations
     */
    function unpause() external onlyOwner {
        paused = false;
        emit EmergencyUnpaused(msg.sender);
    }
    
    /**
     * @dev Withdraws contract balance to owner
     */
    function withdrawBalance() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "MonthlySubscription: No balance to withdraw");
        
        (bool success, ) = owner.call{value: balance}("");
        require(success, "MonthlySubscription: Withdrawal failed");
        
        emit FundsWithdrawn(owner, balance);
    }
    
    /**
     * @dev Gets contract balance
     * @return Contract balance in wei
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
    
    /**
     * @dev Fallback function to prevent accidental ETH transfers
     */
    receive() external payable {
        revert("MonthlySubscription: Direct payments not accepted");
    }
}
