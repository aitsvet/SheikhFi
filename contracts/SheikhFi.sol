// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract SheikhFi {

    address public owner;
    string public ownerNickname;

    uint public totalFunds;
    uint public freeFunds;

    uint constant SCALE = 1e18;
    uint public cumulativePerShare;

    struct Investor {
        string nickname;
        uint profitRate;
        uint fundsInvested;
        uint profit;
        uint checkpoint;
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
        uint revenuePaid;
    }
    Proposal[] public proposals;
    address[][] public approvers;      // list of investors who approved the proposal
    uint public approveShareThreshold; // approvers share required for the proposal to be funded

    mapping(address => uint) public withdrawable;

    event InvestorAdded(address indexed investor, string nickname, uint profitRate);
    event ManagerAdded(address indexed manager, string nickname, uint profitRate);
    event FundsDeposited(address indexed investor, uint amount);
    event ProposalSubmitted(uint indexed proposalId, address indexed manager, string description, uint fundsRequired);
    event ProposalFunded(uint indexed proposalId, address indexed manager, uint fundsRequired);
    event RevenueReceived(uint indexed proposalId, address indexed manager, uint amount);
    event RevenueDistributed(uint indexed proposalId, uint revenue);
    event Withdrawn(address indexed account, uint amount);

    function isInvestor(address addr) public view returns (bool) {
        return bytes(investors[addr].nickname).length > 0;
    }

    function isManager(address addr) public view returns (bool) {
        return bytes(managers[addr].nickname).length > 0;
    }

    function getInvestorCount() external view returns (uint) { return investorAddresses.length; }
    function getManagerCount() external view returns (uint) { return managerAddresses.length; }
    function getProposalCount() external view returns (uint) { return proposals.length; }

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }
    modifier onlyManager() { require(isManager(msg.sender), "Not manager"); _; }
    modifier onlyInvestor() { require(isInvestor(msg.sender), "Not investor"); _; }

    constructor(string memory _ownerNickname, uint _approveShareThreshold) {
        owner = msg.sender;
        ownerNickname = _ownerNickname;
        investorAddresses.push(msg.sender);
        investors[msg.sender] = Investor(_ownerNickname, 100, 0, 0, cumulativePerShare);
        approveShareThreshold = _approveShareThreshold;
    }

    function addInvestor(address investor, string calldata nickname, uint profitRate) external onlyOwner {
        require(investor != address(0), "Zero address");
        require(profitRate <= 100, "Profit rate > 100");
        require(bytes(nickname).length != 0, "Empty nickname");
        require(!isInvestor(investor), "Already investor");
        investorAddresses.push(investor);
        investors[investor] = Investor(nickname, profitRate, 0, 0, cumulativePerShare);
        emit InvestorAdded(investor, nickname, profitRate);
    }

    function addManager(address manager, string calldata nickname, uint profitRate) external onlyOwner {
        require(manager != address(0), "Zero address");
        require(profitRate <= 100, "Profit rate > 100");
        require(bytes(nickname).length != 0, "Empty nickname");
        require(!isManager(manager), "Already manager");
        managerAddresses.push(manager);
        managers[manager] = Manager(nickname, profitRate, 0, 0);
        emit ManagerAdded(manager, nickname, profitRate);
    }

    function _accrue(address inv) internal {
        Investor storage i = investors[inv];
        if (i.fundsInvested == 0) {
            i.checkpoint = cumulativePerShare;
            return;
        }
        uint delta = cumulativePerShare - i.checkpoint;
        if (delta == 0) return;
        uint gross = delta * i.fundsInvested / SCALE;
        uint myPart = gross * i.profitRate / 100;
        uint ownerPart = gross - myPart;
        withdrawable[inv] += myPart;
        i.profit += myPart;
        if (inv != owner) {
            withdrawable[owner] += ownerPart;
            investors[owner].profit += ownerPart;
        }
        i.checkpoint = cumulativePerShare;
    }

    function settle(address inv) external {
        require(isInvestor(inv), "Not investor");
        _accrue(inv);
    }

    function settleBatch(address[] calldata invs) external {
        for (uint i = 0; i < invs.length; i++) {
            if (isInvestor(invs[i])) _accrue(invs[i]);
        }
    }

    function depositFunds() external payable onlyInvestor {
        require(msg.value > 0, "No value");
        _accrue(msg.sender);
        investors[msg.sender].fundsInvested += msg.value;
        totalFunds += msg.value;
        freeFunds += msg.value;
        emit FundsDeposited(msg.sender, msg.value);
    }

    function submitProposal(string calldata description, uint requiredFunds) external onlyManager {
        require(bytes(description).length != 0, "Empty description");
        require(requiredFunds <= freeFunds, "Insufficient funds");
        uint proposalId = proposals.length;
        proposals.push(Proposal(msg.sender, description, requiredFunds, false, 0, 0));
        approvers.push();
        emit ProposalSubmitted(proposalId, msg.sender, description, requiredFunds);
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
        approvers[proposalId].push(msg.sender);
        // if the approve share exceeds threshold, the proposal is funded
        if (approveShare * 100 / totalFunds >= approveShareThreshold) {
            address manager = proposals[proposalId].manager;
            freeFunds -= fundsRequired;
            proposals[proposalId].secured = true;
            managers[manager].fundsSecured += fundsRequired;
            withdrawable[manager] += fundsRequired;
            emit ProposalFunded(proposalId, manager, fundsRequired);
        }
    }

    // manager receives revenue from the investment in real-world asset
    function receiveRevenue(uint proposalId) external payable {
        require(msg.value > 0, "No value");
        require(msg.sender == proposals[proposalId].manager, "Not proposal manager");
        proposals[proposalId].revenueReceived += msg.value;
        emit RevenueReceived(proposalId, msg.sender, msg.value);
    }

    // owner distributes the revenue to the investors and the manager
    function distributeRevenue(uint proposalId) external onlyOwner {
        uint revenue = proposals[proposalId].revenueReceived - proposals[proposalId].revenuePaid;
        require(revenue > 0, "No revenue");
        require(totalFunds > 0, "No investors");
        proposals[proposalId].revenuePaid = proposals[proposalId].revenueReceived;

        address manager = proposals[proposalId].manager;
        uint managerFee = revenue * managers[manager].profitRate / 100;
        uint investorRevenue = revenue - managerFee;

        withdrawable[manager] += managerFee;
        managers[manager].profit += managerFee;

        if (investorRevenue > 0) {
            cumulativePerShare += investorRevenue * SCALE / totalFunds;
        }

        emit RevenueDistributed(proposalId, revenue);
    }

    function withdraw() external {
        if (isInvestor(msg.sender)) _accrue(msg.sender);
        uint amount = withdrawable[msg.sender];
        require(amount > 0, "Nothing to withdraw");
        withdrawable[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    function getApprovers(uint proposalId) public view returns (address[] memory) {
        return approvers[proposalId];
    }

    function pendingAccrual(address inv) external view returns (uint myPending, uint ownerPending) {
        Investor storage i = investors[inv];
        if (i.fundsInvested == 0) return (0, 0);
        uint delta = cumulativePerShare - i.checkpoint;
        uint gross = delta * i.fundsInvested / SCALE;
        myPending = gross * i.profitRate / 100;
        ownerPending = (inv == owner) ? 0 : gross - myPending;
    }
}
