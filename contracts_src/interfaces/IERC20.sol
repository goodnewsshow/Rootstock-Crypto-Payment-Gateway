// SPDX-License-Identifier: MIT
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
