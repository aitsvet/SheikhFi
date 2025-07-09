// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract SheikhFi {

    address public owner;
    string public ownerNickname;

    uint public totalFunds;
    uint public freeFunds;

    struct Investor {
        string nickname;
        uint profitRate;
        uint fundsInvested;
        uint profit;
    }
    mapping(address => Investor) public investors;
    address[] public investorAddresses;

    struct Manager {
        string nickname;
        uint profitRate;
        uint fundsSecured;
        uint profit;
    }
    mapping(address => Manager) public managers;
    address[] public managerAddresses;

    struct Proposal {
        address manager;
        string description;
        uint fundsRequired;
        bool secured;
        uint revenueReceived;
        uint revenuePayed;
    }
    Proposal[] public proposals;
    address[][] public approvers;      // list of investors who approved the proposal
    uint public approveShareThreshold; // approvers share required for the proposal to be funded

    function isInvestor(address addr) public view returns (bool) {
        return bytes(investors[addr].nickname).length > 0;
    }

    function isManager(address addr) public view returns (bool) {
        return bytes(managers[addr].nickname).length > 0;
    }

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }
    modifier onlyManager() { require(isManager(msg.sender), "Not manager"); _; }
    modifier onlyInvestor() { require(isInvestor(msg.sender), "Not investor"); _; }

    constructor(string memory _ownerNickname, uint _approveShareThreshold) {
        owner = msg.sender;
        ownerNickname = _ownerNickname;
        investorAddresses.push(msg.sender);
        investors[msg.sender] = Investor(_ownerNickname, 100, 0, 0);
        approveShareThreshold = _approveShareThreshold;
    }

    function addInvestor(address investor, string calldata nickname, uint profitRate) external onlyOwner {
        require(investor != address(0), "Zero address");
        require(profitRate >= 0, "Profit rate < 0");
        require(profitRate <= 100, "Profit rate > 100");
        require(bytes(nickname).length != 0, "Empty nickname");
        require(!isInvestor(investor), "Already investor");
        investorAddresses.push(investor);
        investors[investor] = Investor(nickname, profitRate, 0, 0);
    }

    function addManager(address manager, string calldata nickname, uint profitRate) external onlyOwner {
        require(manager != address(0), "Zero address");
        require(profitRate >= 0, "Profit rate < 0");
        require(profitRate <= 100, "Profit rate > 100");
        require(bytes(nickname).length != 0, "Empty nickname");
        require(!isManager(manager), "Already manager");
        managerAddresses.push(manager);
        managers[manager] = Manager(nickname, profitRate, 0, 0);
    }

    function depositFunds() external payable onlyInvestor {
        require(msg.value > 0, "No value");
        investors[msg.sender].fundsInvested += msg.value;
        totalFunds += msg.value;
        freeFunds += msg.value;
    }

    function submitProposal(string calldata description, uint requiredFunds) external onlyManager {
        require(bytes(description).length != 0, "Empty description");
        require(requiredFunds <= freeFunds, "Insufficient funds");
        proposals.push(Proposal(msg.sender, description, requiredFunds, false, 0, 0));
        approvers.push();
    }

    function approveProposal(uint proposalId) external onlyInvestor {
        uint fundsRequired = proposals[proposalId].fundsRequired;
        require(fundsRequired <= freeFunds, "Insufficient funds");
        require(!proposals[proposalId].secured, "Already funded");
        // calculate the total funds invested by the approvers
        uint approveShare = investors[msg.sender].fundsInvested;
        for (uint i = 0; i < approvers[proposalId].length; i++) {
            address approver = approvers[proposalId][i];
            require(approver != msg.sender, "Already voted");
            approveShare += investors[approver].fundsInvested;
        }
        // add the sender to the approvers list
        approvers[proposalId].push(msg.sender);
        // if the approve share exceeds threshold, the proposal is funded
        // the manager receives the funds required to buy the real-world asset
        if (approveShare * 100 / totalFunds >= approveShareThreshold) {
            address manager = proposals[proposalId].manager;
            payable(manager).transfer(fundsRequired);
            freeFunds -= fundsRequired;
            proposals[proposalId].secured = true;
            managers[manager].fundsSecured += fundsRequired;
        }
    }

    // manager receives revenue from the investment in real-world asset
    function recieveRevenue(uint proposalId) external payable {
        require(msg.value > 0, "No value");
        require(msg.sender == proposals[proposalId].manager, "Not proposal manager");
        proposals[proposalId].revenueReceived += msg.value;
    }

    // owner distributes the revenue to the investors and the manager
    function distributeRevenue(uint proposalId) external onlyOwner {
        // calculate the revenue not yet distributed
        uint revenue = proposals[proposalId].revenueReceived - proposals[proposalId].revenuePayed;
        require(revenue > 0, "No revenue");
        // distribute the manager fee
        address manager = proposals[proposalId].manager;
        uint managerFee = revenue * managers[manager].profitRate / 100;
        uint investorRevenue = revenue - managerFee;
        payable(manager).transfer(managerFee);
        managers[manager].profit += managerFee;
        // distribute the investor profits
        for (uint i = 0; i < investorAddresses.length; i++) {
            address inv = investorAddresses[i];
            uint payout = investorRevenue * investors[inv].fundsInvested / totalFunds;
            if (payout > 0) {
                // distribute the investor profit (rate can be personalized)
                uint investorPayout = payout * investors[inv].profitRate / 100;
                payable(inv).transfer(investorPayout);
                investors[inv].profit += investorPayout;
                // distribute the owner profit (ex. to cover operational costs)
                uint ownerPayout = payout - investorPayout;
                payable(owner).transfer(ownerPayout);
                investors[owner].profit += ownerPayout;
            }
        }
        // mark the revenue as paid
        proposals[proposalId].revenuePayed = proposals[proposalId].revenueReceived;
    }

    function getApprovers(uint proposalId) public view returns (address[] memory) {
        return approvers[proposalId];
    }
} 