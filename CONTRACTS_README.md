# RIF Subscription Smart Contract

A Solidity smart contract for the **Rootstock** blockchain that enables recurring subscription payments every **30 days** using the **RIF token**.

---

## Files

```
contracts/
├── interfaces/
│   └── IERC20.sol          # Standard ERC-20 interface for the RIF token
└── src/
    └── RIFSubscription.sol # Main subscription contract
```

---

## How It Works

```
Subscriber                     RIFSubscription              RIF Token
    |                               |                           |
    |-- approve(contract, price) -->|                           |
    |                               |                           |
    |-- subscribe() --------------->|                           |
    |                               |-- transferFrom(sub) ----->|
    |                               |<-- success ---------------|
    |                               |                           |
    |           (30 days pass)      |                           |
    |                               |                           |
    |  chargeSubscriber(address) -->|                           |
    |        (keeper / anyone)      |-- transferFrom(sub) ----->|
    |                               |<-- success / fail --------|
    |                               |   (fail = auto-cancel)    |
    |                               |                           |
    |-- cancelSubscription() ------>|                           |
```

---

## Deployment

### RIF Token Addresses

| Network             | Address                                      |
|---------------------|----------------------------------------------|
| Rootstock Mainnet   | `0x2aCc95758f8b5F583470bA265Eb685a8f45fC9D` |
| Rootstock Testnet   | `0x19F64674D8A5B4E652319F5e239eFd3bc969A1fE` |

### Constructor Parameters

```solidity
constructor(address _rifToken, uint256 _price)
```

| Parameter  | Type      | Description                                                       |
|------------|-----------|-------------------------------------------------------------------|
| `_rifToken`| `address` | RIF token contract address (see table above)                     |
| `_price`   | `uint256` | Monthly price in RIF base units (e.g. `5 * 1e18` = 5 RIF/month) |

### Example (Hardhat / Ethers.js)

```js
const RIFSubscription = await ethers.getContractFactory("RIFSubscription");
const rifTokenAddress = "0x19F64674D8A5B4E652319F5e239eFd3bc969A1fE"; // testnet
const priceInRIF = ethers.parseEther("5"); // 5 RIF per month
const contract = await RIFSubscription.deploy(rifTokenAddress, priceInRIF);
await contract.waitForDeployment();
```

---

## Usage

### 1. Subscriber: Approve token spending

Before subscribing, the user must approve this contract to spend their RIF tokens:

```js
const rifToken = await ethers.getContractAt("IERC20", rifTokenAddress);
await rifToken.approve(subscriptionContractAddress, ethers.parseEther("5"));
```

### 2. Subscriber: Start a subscription

The first payment is collected immediately upon subscribing:

```js
await subscriptionContract.subscribe();
```

### 3. Collect recurring payments (after 30 days)

Anyone (a keeper bot, the owner, or the subscriber themselves) can trigger the next charge:

```js
await subscriptionContract.chargeSubscriber(subscriberAddress);
```

Or batch multiple charges in one transaction:

```js
await subscriptionContract.chargeSubscribers([addr1, addr2, addr3]);
```

### 4. Cancel a subscription

```js
await subscriptionContract.cancelSubscription(); // called by subscriber
```

### 5. Owner: Withdraw accumulated RIF funds

```js
await subscriptionContract.withdrawFunds();
```

---

## Key Functions

### Subscriber Functions

| Function                | Description                                          |
|-------------------------|------------------------------------------------------|
| `subscribe()`           | Start a new subscription (charges first period)     |
| `cancelSubscription()`  | Cancel your own active subscription                 |

### Public Billing Functions

| Function                              | Description                                              |
|---------------------------------------|----------------------------------------------------------|
| `chargeSubscriber(address)`           | Charge one subscriber if their billing cycle is due     |
| `chargeSubscribers(address[])`        | Batch-charge multiple subscribers                       |

### Owner Functions

| Function                          | Description                                      |
|-----------------------------------|--------------------------------------------------|
| `withdrawFunds()`                 | Withdraw all collected RIF tokens                |
| `setSubscriptionPrice(uint256)`   | Update the monthly price for new billing cycles  |
| `transferOwnership(address)`      | Transfer contract ownership                      |
| `forceCancel(address)`            | Cancel a subscriber's subscription               |

### View Functions

| Function                          | Returns                                          |
|-----------------------------------|--------------------------------------------------|
| `isSubscribed(address)`           | `true` if the address has an active subscription |
| `getSubscription(address)`        | Full subscription struct for an address          |
| `timeUntilNextPayment(address)`   | Seconds until next charge is due                 |
| `getSubscriberList()`             | All historical subscriber addresses              |
| `contractBalance()`               | RIF tokens held by the contract                  |

---

## Events

| Event                 | Emitted When                                           |
|-----------------------|--------------------------------------------------------|
| `Subscribed`          | A new subscription starts                             |
| `PaymentCollected`    | A recurring payment is successfully charged           |
| `PaymentFailed`       | A charge attempt fails (subscription is then cancelled)|
| `SubscriptionCancelled` | A subscription is cancelled                        |
| `FundsWithdrawn`      | The owner withdraws RIF tokens                        |
| `PriceUpdated`        | The subscription price is changed                     |
| `OwnershipTransferred`| Ownership is transferred to a new address             |

---

## Automating Recurring Charges

The contract does **not** automatically charge subscribers — it relies on an external trigger. You have several options:

### Option A: Gelato Network (Recommended for Rootstock)
Use [Gelato](https://www.gelato.network/) to create a task that calls `chargeSubscriber` on a schedule.

### Option B: Custom Keeper Bot (Node.js / Ethers.js)

```js
const { ethers } = require("ethers");

async function runKeeper() {
  const subscribers = await contract.getSubscriberList();
  const due = [];

  for (const addr of subscribers) {
    const timeLeft = await contract.timeUntilNextPayment(addr);
    if (timeLeft === 0n) due.push(addr);
  }

  if (due.length > 0) {
    const tx = await contract.chargeSubscribers(due);
    await tx.wait();
    console.log(`Charged ${due.length} subscriber(s)`);
  }
}

// Run every hour
setInterval(runKeeper, 60 * 60 * 1000);
```

### Option C: Subscribers self-renew
Subscribers can simply call `chargeSubscriber(theirOwnAddress)` to renew manually.

---

## Compiling

Use [Hardhat](https://hardhat.org/) or [Foundry](https://book.getfoundry.sh/) to compile.

**Hardhat:**
```bash
npx hardhat compile
```

**Foundry:**
```bash
forge build
```

Solidity version: `^0.8.20`

---

## Security Notes

- Subscribers must maintain a sufficient RIF balance **and** an active allowance ≥ `subscriptionPrice`. If either is too low when a charge is attempted, the subscription is cancelled automatically.
- The owner cannot access subscriber funds directly — they can only withdraw tokens already transferred to the contract.
- Use a multisig wallet (e.g. Gnosis Safe on Rootstock) as the `owner` for production deployments.
