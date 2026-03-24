// SPDX-License-Identifier: MIT

//Pat Blk capstoen idea ofr Rootstock Rootcamp

pragma solidity ^0.8.4;

//To Do's

// accept payment

//To Do's check wallet to make sure funds are available, accept the funds and activate subscription
//Accept payment on a 30 day basis
//If no funds are available, deactivate the subscription

contract Subscription {
    enum State { Active, Paused, Canceled }
    
    State public currentState;
    address public subscriber;
    
    event StateChanged(State newState);
    
    constructor() {
        currentState = State.Active; // Initial state
        subscriber = msg.sender; // Set the subscriber to the contract creator
    }
    
    function pauseSubscription() public {
        require(msg.sender == subscriber, "Only the subscriber can pause the subscription");
        require(currentState == State.Active, "Subscription is not active");
        
        currentState = State.Paused;
        emit StateChanged(currentState);
    }
    
    function resumeSubscription() public {
        require(msg.sender == subscriber, "Only the subscriber can resume the subscription");
        require(currentState == State.Paused, "Subscription is not paused");
        
        currentState = State.Active;
        emit StateChanged(currentState);
    }
    
    function cancelSubscription() public {
        require(msg.sender == subscriber, "Only the subscriber can cancel the subscription");
        
        currentState = State.Canceled;
        emit StateChanged(currentState);
    }
}


