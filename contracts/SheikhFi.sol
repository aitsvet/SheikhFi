// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

contract SheikhFi {

    address public owner;
    address public pendingOwner;
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
        uint approvalWeight;           // sum of approvers' stakes, frozen at vote time
        uint deadline;                 // voting closes at this timestamp
        bool cancelled;
        uint principalReturned;        // capital repaid by the manager, fee-free
        bool writtenOff;               // unrecovered capital written down pro-rata
    }
    Proposal[] public proposals;
    address[][] public approvers;      // list of investors who approved the proposal
    mapping(uint => mapping(address => bool)) public hasVoted;
    uint public approveShareThreshold; // approvers share required for the proposal to be funded
    uint public votingPeriod = 30 days;

    mapping(address => uint) public withdrawable;

    event InvestorAdded(address indexed investor, string nickname, uint profitRate);
    event ManagerAdded(address indexed manager, string nickname, uint profitRate);
    event FundsDeposited(address indexed investor, uint amount);
    event ProposalSubmitted(uint indexed proposalId, address indexed manager, string description, uint fundsRequired);
    event ProposalApproved(uint indexed proposalId, address indexed investor, uint approveShare);
    event ProposalFunded(uint indexed proposalId, address indexed manager, uint fundsRequired);
    event ProposalCancelled(uint indexed proposalId);
    event ThresholdChanged(uint threshold);
    event VotingPeriodChanged(uint period);
    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);
    event RevenueReceived(uint indexed proposalId, address indexed manager, uint amount);
    event PrincipalReturned(uint indexed proposalId, address indexed manager, uint amount);
    event ProposalWrittenOff(uint indexed proposalId, uint loss);
    event RevenueDistributed(uint indexed proposalId, uint revenue);
    event Exited(address indexed investor, uint amount);
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
        proposals.push(Proposal(
            msg.sender, description, requiredFunds, false, 0, 0,
            0, block.timestamp + votingPeriod, false, 0, false
        ));
        approvers.push();
        emit ProposalSubmitted(proposalId, msg.sender, description, requiredFunds);
    }

    function approveProposal(uint proposalId) external onlyInvestor {
        require(totalFunds > 0, "No investors");
        Proposal storage p = proposals[proposalId];
        require(!p.cancelled, "Cancelled");
        require(block.timestamp <= p.deadline, "Voting closed");
        require(p.fundsRequired <= freeFunds, "Insufficient funds");
        require(!p.secured, "Already funded");
        require(!hasVoted[proposalId][msg.sender], "Already voted");
        hasVoted[proposalId][msg.sender] = true;
        approvers[proposalId].push(msg.sender);
        // each vote's weight is frozen at vote time: later deposits or exits
        // do not inflate or deflate votes already cast
        p.approvalWeight += investors[msg.sender].fundsInvested;
        emit ProposalApproved(proposalId, msg.sender, p.approvalWeight);
        // if the approve share exceeds threshold, the proposal is funded
        if (p.approvalWeight * 100 / totalFunds >= approveShareThreshold) {
            address manager = p.manager;
            freeFunds -= p.fundsRequired;
            p.secured = true;
            managers[manager].fundsSecured += p.fundsRequired;
            withdrawable[manager] += p.fundsRequired;
            emit ProposalFunded(proposalId, manager, p.fundsRequired);
        }
    }

    function cancelProposal(uint proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(msg.sender == p.manager || msg.sender == owner, "Not authorized");
        require(!p.secured, "Already funded");
        require(!p.cancelled, "Cancelled");
        p.cancelled = true;
        emit ProposalCancelled(proposalId);
    }

    function setApproveShareThreshold(uint t) external onlyOwner {
        require(t >= 1 && t <= 100, "Bad threshold");
        approveShareThreshold = t;
        emit ThresholdChanged(t);
    }

    function setVotingPeriod(uint p) external onlyOwner {
        require(p >= 1 days && p <= 365 days, "Bad period");
        votingPeriod = p;
        emit VotingPeriodChanged(p);
    }

    // Two-step ownership transfer. The new owner must already be an investor:
    // _accrue routes the owner cut to investors[owner], which must be a real
    // record for the accounting to stay consistent.
    function transferOwnership(address newOwner) external onlyOwner {
        require(isInvestor(newOwner), "Not investor");
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Not pending owner");
        // crystallise everything earned under the old rate before switching:
        // pre-transfer accruals keep their old split, and only then does the
        // new owner stop paying the owner cut
        _accrue(msg.sender);
        investors[msg.sender].profitRate = 100;
        // the old owner keeps profitRate 100 as an ordinary investor — an
        // "emeritus" pays no cut to the new owner; deliberate choice
        address old = owner;
        owner = msg.sender;
        ownerNickname = investors[msg.sender].nickname;
        pendingOwner = address(0);
        emit OwnershipTransferred(old, msg.sender);
    }

    // manager repays the deployed capital; goes straight back to the free
    // pool, no fee is taken (AAOIFI SS 13 8/1: the manager's share comes out
    // of profit only, never out of returned capital)
    function returnPrincipal(uint proposalId) external payable {
        require(msg.value > 0, "No value");
        Proposal storage p = proposals[proposalId];
        require(msg.sender == p.manager, "Not proposal manager");
        require(p.secured, "Not secured");
        require(!p.writtenOff, "Written off");
        require(p.principalReturned + msg.value <= p.fundsRequired, "Exceeds principal");
        p.principalReturned += msg.value;
        freeFunds += msg.value;
        emit PrincipalReturned(proposalId, msg.sender, msg.value);
    }

    // manager receives revenue from the investment in real-world asset
    function receiveRevenue(uint proposalId) external payable {
        require(msg.value > 0, "No value");
        require(msg.sender == proposals[proposalId].manager, "Not proposal manager");
        require(proposals[proposalId].secured, "Not secured");
        require(!proposals[proposalId].writtenOff, "Written off");
        proposals[proposalId].revenueReceived += msg.value;
        emit RevenueReceived(proposalId, msg.sender, msg.value);
    }

    // owner writes off the unrecovered capital of a failed project: every
    // investor's stake shrinks in proportion to their share (AAOIFI SS 12
    // 3/1/5/4 — losses strictly pro-rata to capital contributions).
    // Profit accrued so far is crystallised first, at the pre-loss stakes.
    // O(investors) by design: exactness of the loss allocation over lazy
    // accumulators; membership is owner-gated, so the set stays bounded.
    // Write off only when recovery is final — the proposal closes for good.
    function writeOffProposal(uint proposalId) external onlyOwner {
        Proposal storage p = proposals[proposalId];
        require(p.secured, "Not secured");
        require(!p.writtenOff, "Written off");
        uint loss = p.fundsRequired - p.principalReturned;
        require(loss > 0, "Nothing to write off");
        uint tf = totalFunds; // snapshot: reductions below must not skew shares
        uint reduced = 0;
        for (uint i = 0; i < investorAddresses.length; i++) {
            address inv = investorAddresses[i];
            _accrue(inv);
            uint cut = investors[inv].fundsInvested * loss / tf;
            investors[inv].fundsInvested -= cut;
            reduced += cut;
        }
        // truncation dust stays as stake, keeping totalFunds == Σ fundsInvested
        totalFunds -= reduced;
        p.writtenOff = true;
        emit ProposalWrittenOff(proposalId, loss);
    }

    // owner distributes the revenue to the investors and the manager
    function distributeRevenue(uint proposalId) external onlyOwner {
        Proposal storage p = proposals[proposalId];
        uint revenue = p.revenueReceived - p.revenuePaid;
        require(revenue > 0, "No revenue");
        // profit is recognised only once the capital is home (AAOIFI SS 13
        // 8/7) — or the shortfall has been written down as a loss
        require(p.principalReturned == p.fundsRequired || p.writtenOff, "Principal outstanding");
        // reachable: every investor may have exited fully by the time the
        // revenue arrives, leaving nobody to distribute to
        require(totalFunds > 0, "No investors");
        p.revenuePaid = p.revenueReceived;

        address manager = p.manager;
        uint managerFee = revenue * managers[manager].profitRate / 100;
        uint investorRevenue = revenue - managerFee;

        withdrawable[manager] += managerFee;
        managers[manager].profit += managerFee;

        if (investorRevenue > 0) {
            cumulativePerShare += investorRevenue * SCALE / totalFunds;
        }

        emit RevenueDistributed(proposalId, revenue);
    }

    // investor takes part of their stake back out of the free pool — an exit
    // at constructive valuation (AAOIFI SS 12 3/1/6/2, 3/1/5/9): freeFunds is
    // realised cash and the stake is already net of written-off losses;
    // capital deployed into live projects cannot leave until returned or
    // written off
    function exit(uint amount) external onlyInvestor {
        require(amount > 0, "No value");
        _accrue(msg.sender);
        Investor storage inv = investors[msg.sender];
        require(amount <= inv.fundsInvested, "Exceeds stake");
        require(amount <= freeFunds, "Insufficient free funds");
        inv.fundsInvested -= amount;
        totalFunds -= amount;
        freeFunds -= amount;
        withdrawable[msg.sender] += amount;
        emit Exited(msg.sender, amount);
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
