// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IERC20Minimal {
    function transfer(address to, uint amount) external returns (bool);
    function transferFrom(address from, address to, uint amount) external returns (bool);
}

contract SheikhFi {

    address public owner;
    address public pendingOwner;
    // sharia board: certifies proposals, attests milestones, issues verdicts
    address public board;
    string public ownerNickname;

    // pool denomination: address(0) = native ETH, otherwise an ERC-20 (USDC…)
    address public asset;

    uint public totalFunds;
    uint public freeFunds;

    uint constant SCALE = 1e18;
    uint public cumulativePerShare;

    // The Musharaka share is a transferable ERC-20 (SS 17 3/6, 5/2/16):
    // balanceOf mirrors fundsInvested, totalSupply mirrors totalFunds.
    // The pool stays permissioned — transfers only between onboarded investors.
    string public constant name = "SheikhFi Musharaka Share";
    string public constant symbol = "SHFI";
    uint8 public constant decimals = 18;
    mapping(address => mapping(address => uint)) public allowance;

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
        uint collateral;               // security posted by the manager
        uint activeProjects;           // secured, not yet fully repaid / written off
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
        string docsHash;               // IPFS CID of the real-asset documents
        uint tranches;                 // capital is disbursed in this many parts
        uint tranchesReleased;
        bool certified;                // board sign-off; voting opens only after
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
    event ProposalCertified(uint indexed proposalId);
    event ProposalApproved(uint indexed proposalId, address indexed investor, uint approveShare);
    event ProposalFunded(uint indexed proposalId, address indexed manager, uint fundsRequired);
    event ProposalCancelled(uint indexed proposalId);
    event TrancheReleased(uint indexed proposalId, uint index, uint amount);
    event ThresholdChanged(uint threshold);
    event VotingPeriodChanged(uint period);
    event BoardChanged(address indexed board);
    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);
    event RevenueReceived(uint indexed proposalId, address indexed manager, uint amount);
    event PrincipalReturned(uint indexed proposalId, address indexed manager, uint amount);
    event ProposalWrittenOff(uint indexed proposalId, uint loss);
    event RevenueDistributed(uint indexed proposalId, uint revenue);
    event Exited(address indexed investor, uint amount);
    event Withdrawn(address indexed account, uint amount);
    event CollateralPosted(address indexed manager, uint amount);
    event CollateralWithdrawn(address indexed manager, uint amount);
    event CollateralSlashed(address indexed manager, uint indexed proposalId, uint amount, string reason);
    event Transfer(address indexed from, address indexed to, uint value);
    event Approval(address indexed holder, address indexed spender, uint value);

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
    modifier onlyBoard() { require(msg.sender == board, "Not board"); _; }
    modifier onlyManager() { require(isManager(msg.sender), "Not manager"); _; }
    modifier onlyInvestor() { require(isInvestor(msg.sender), "Not investor"); _; }

    constructor(string memory _ownerNickname, uint _approveShareThreshold, address _asset) {
        owner = msg.sender;
        board = msg.sender;
        asset = _asset;
        ownerNickname = _ownerNickname;
        investorAddresses.push(msg.sender);
        investors[msg.sender] = Investor(_ownerNickname, 100, 0, 0, cumulativePerShare);
        approveShareThreshold = _approveShareThreshold;
    }

    // ---------------------------------------------------------- money in/out

    // one entry point for both denominations: native requires the exact value
    // attached, token mode pulls via transferFrom (no stray ETH accepted)
    function _pull(uint amount) internal {
        if (asset == address(0)) {
            require(msg.value == amount, "Value mismatch");
        } else {
            require(msg.value == 0, "Native not accepted");
            require(IERC20Minimal(asset).transferFrom(msg.sender, address(this), amount), "Token transfer failed");
        }
    }

    function _pay(address to, uint amount) internal {
        if (asset == address(0)) {
            (bool ok, ) = payable(to).call{value: amount}("");
            require(ok, "Transfer failed");
        } else {
            require(IERC20Minimal(asset).transfer(to, amount), "Transfer failed");
        }
    }

    // ---------------------------------------------------------------- roles

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
        managers[manager] = Manager(nickname, profitRate, 0, 0, 0, 0);
        emit ManagerAdded(manager, nickname, profitRate);
    }

    function setBoard(address b) external onlyOwner {
        require(b != address(0), "Zero address");
        board = b;
        emit BoardChanged(b);
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

    // -------------------------------------------------------------- accrual

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

    // -------------------------------------------------------------- deposits

    function depositFunds(uint amount) external payable onlyInvestor {
        require(amount > 0, "No value");
        _pull(amount);
        _accrue(msg.sender);
        investors[msg.sender].fundsInvested += amount;
        totalFunds += amount;
        freeFunds += amount;
        emit FundsDeposited(msg.sender, amount);
        emit Transfer(address(0), msg.sender, amount);
    }

    // ------------------------------------------------------------- proposals

    function submitProposal(
        string calldata description,
        uint requiredFunds,
        string calldata docsHash,
        uint tranches
    ) external onlyManager {
        require(bytes(description).length != 0, "Empty description");
        require(requiredFunds <= freeFunds, "Insufficient funds");
        require(tranches >= 1 && tranches <= 12, "Bad tranches");
        uint proposalId = proposals.length;
        proposals.push();
        Proposal storage p = proposals[proposalId];
        p.manager = msg.sender;
        p.description = description;
        p.fundsRequired = requiredFunds;
        p.deadline = block.timestamp + votingPeriod;
        p.docsHash = docsHash;
        p.tranches = tranches;
        approvers.push();
        emit ProposalSubmitted(proposalId, msg.sender, description, requiredFunds);
    }

    // board sign-off on the real-asset documents; voting opens only after
    function certifyProposal(uint proposalId) external onlyBoard {
        Proposal storage p = proposals[proposalId];
        require(!p.cancelled, "Cancelled");
        require(!p.certified, "Already certified");
        p.certified = true;
        emit ProposalCertified(proposalId);
    }

    // capital disbursed so far: equal tranches, division dust rides on the last
    function _releasedAmount(Proposal storage p) internal view returns (uint) {
        if (!p.secured) return 0;
        return p.tranchesReleased == p.tranches
            ? p.fundsRequired
            : p.fundsRequired / p.tranches * p.tranchesReleased;
    }

    function approveProposal(uint proposalId) external onlyInvestor {
        require(totalFunds > 0, "No investors");
        Proposal storage p = proposals[proposalId];
        require(!p.cancelled, "Cancelled");
        require(p.certified, "Not certified");
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
            // the whole amount is reserved, but only tranche #1 is disbursed
            freeFunds -= p.fundsRequired;
            p.secured = true;
            p.tranchesReleased = 1;
            uint firstTranche = p.tranches == 1 ? p.fundsRequired : p.fundsRequired / p.tranches;
            managers[manager].fundsSecured += p.fundsRequired;
            managers[manager].activeProjects += 1;
            withdrawable[manager] += firstTranche;
            emit ProposalFunded(proposalId, manager, p.fundsRequired);
            if (p.tranches > 1) emit TrancheReleased(proposalId, 1, firstTranche);
        }
    }

    // board attests a milestone and releases the next tranche to the manager
    function releaseTranche(uint proposalId) external onlyBoard {
        Proposal storage p = proposals[proposalId];
        require(p.secured, "Not secured");
        require(!p.writtenOff, "Written off");
        require(p.tranchesReleased < p.tranches, "All released");
        uint before = _releasedAmount(p);
        p.tranchesReleased += 1;
        uint amount = _releasedAmount(p) - before;
        withdrawable[p.manager] += amount;
        emit TrancheReleased(proposalId, p.tranchesReleased, amount);
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

    // ------------------------------------------------------- capital & profit

    // manager repays the disbursed capital; goes straight back to the free
    // pool, no fee is taken (AAOIFI SS 13 8/1: the manager's share comes out
    // of profit only, never out of returned capital)
    function returnPrincipal(uint proposalId, uint amount) external payable {
        require(amount > 0, "No value");
        Proposal storage p = proposals[proposalId];
        require(msg.sender == p.manager, "Not proposal manager");
        require(p.secured, "Not secured");
        require(!p.writtenOff, "Written off");
        // only what was actually disbursed can come home
        require(p.principalReturned + amount <= _releasedAmount(p), "Exceeds principal");
        _pull(amount);
        p.principalReturned += amount;
        freeFunds += amount;
        if (p.principalReturned == p.fundsRequired) {
            managers[msg.sender].activeProjects -= 1;
        }
        emit PrincipalReturned(proposalId, msg.sender, amount);
    }

    // manager receives revenue from the investment in real-world asset
    function receiveRevenue(uint proposalId, uint amount) external payable {
        require(amount > 0, "No value");
        require(msg.sender == proposals[proposalId].manager, "Not proposal manager");
        require(proposals[proposalId].secured, "Not secured");
        require(!proposals[proposalId].writtenOff, "Written off");
        _pull(amount);
        proposals[proposalId].revenueReceived += amount;
        emit RevenueReceived(proposalId, msg.sender, amount);
    }

    // owner writes off a failed project: undisbursed tranches are un-reserved
    // back into freeFunds, and the disbursed-but-unreturned part shrinks every
    // investor's stake in proportion to their share (AAOIFI SS 12 3/1/5/4 —
    // losses strictly pro-rata to capital contributions).
    // Profit accrued so far is crystallised first, at the pre-loss stakes.
    // O(investors) by design: exactness of the loss allocation over lazy
    // accumulators; membership is owner-gated, so the set stays bounded.
    // Write off only when recovery is final — the proposal closes for good.
    function writeOffProposal(uint proposalId) external onlyOwner {
        Proposal storage p = proposals[proposalId];
        require(p.secured, "Not secured");
        require(!p.writtenOff, "Written off");
        uint released = _releasedAmount(p);
        uint unreleased = p.fundsRequired - released;
        uint loss = released - p.principalReturned;
        require(loss > 0 || unreleased > 0, "Nothing to write off");
        if (unreleased > 0) {
            freeFunds += unreleased; // lift the reservation for undisbursed tranches
        }
        if (loss > 0) {
            uint tf = totalFunds; // snapshot: reductions below must not skew shares
            uint reduced = 0;
            for (uint i = 0; i < investorAddresses.length; i++) {
                address inv = investorAddresses[i];
                _accrue(inv);
                uint cut = investors[inv].fundsInvested * loss / tf;
                investors[inv].fundsInvested -= cut;
                reduced += cut;
                emit Transfer(inv, address(0), cut);
            }
            // truncation dust stays as stake, keeping totalFunds == Σ fundsInvested
            totalFunds -= reduced;
        }
        if (p.principalReturned < p.fundsRequired) {
            managers[p.manager].activeProjects -= 1;
        }
        p.writtenOff = true;
        emit ProposalWrittenOff(proposalId, loss);
    }

    // owner distributes the revenue to the investors and the manager
    function distributeRevenue(uint proposalId) external onlyOwner {
        Proposal storage p = proposals[proposalId];
        uint revenue = p.revenueReceived - p.revenuePaid;
        require(revenue > 0, "No revenue");
        // profit is recognised only once the disbursed capital is home
        // (AAOIFI SS 13 8/7) — or the shortfall has been written down
        require(p.principalReturned == _releasedAmount(p) || p.writtenOff, "Principal outstanding");
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
        emit Transfer(msg.sender, address(0), amount);
    }

    // ------------------------------------------------------------ collateral

    // security posted voluntarily; enforceable only by a board verdict for
    // misconduct, negligence or breach (AAOIFI SS 13 section 6) — never
    // automatically for a commercial loss (yad amanah, SS 13 8/7)
    function postCollateral(uint amount) external payable onlyManager {
        require(amount > 0, "No value");
        _pull(amount);
        managers[msg.sender].collateral += amount;
        emit CollateralPosted(msg.sender, amount);
    }

    function withdrawCollateral(uint amount) external onlyManager {
        require(amount > 0, "No value");
        Manager storage m = managers[msg.sender];
        require(m.activeProjects == 0, "Active projects");
        require(amount <= m.collateral, "Exceeds collateral");
        m.collateral -= amount;
        withdrawable[msg.sender] += amount;
        emit CollateralWithdrawn(msg.sender, amount);
    }

    // the call itself is the verdict; `reason` records the grounds
    function slashCollateral(address manager, uint proposalId, uint amount, string calldata reason) external onlyBoard {
        require(amount > 0, "No value");
        Proposal storage p = proposals[proposalId];
        require(p.manager == manager, "Not proposal manager");
        require(p.secured, "Not secured");
        require(!p.writtenOff, "Written off");
        Manager storage m = managers[manager];
        require(amount <= m.collateral, "Exceeds collateral");
        require(amount <= _releasedAmount(p) - p.principalReturned, "Exceeds shortfall");
        m.collateral -= amount;
        // compensation restores the pool's capital, like a principal return
        p.principalReturned += amount;
        freeFunds += amount;
        if (p.principalReturned == p.fundsRequired) {
            m.activeProjects -= 1;
        }
        emit CollateralSlashed(manager, proposalId, amount, reason);
    }

    // -------------------------------------------------------------- withdraw

    function withdraw() external {
        if (isInvestor(msg.sender)) _accrue(msg.sender);
        uint amount = withdrawable[msg.sender];
        require(amount > 0, "Nothing to withdraw");
        withdrawable[msg.sender] = 0;
        _pay(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ------------------------------------------------------------ ERC-20 view

    function balanceOf(address holder) external view returns (uint) {
        return investors[holder].fundsInvested;
    }

    function totalSupply() external view returns (uint) {
        return totalFunds;
    }

    function transfer(address to, uint amount) external returns (bool) {
        _transferShares(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint amount) external returns (bool) {
        uint a = allowance[from][msg.sender];
        require(a >= amount, "Exceeds allowance");
        if (a != type(uint).max) allowance[from][msg.sender] = a - amount;
        _transferShares(from, to, amount);
        return true;
    }

    function _transferShares(address from, address to, uint amount) internal {
        require(isInvestor(from) && isInvestor(to), "Not investor");
        // crystallise both sides at their pre-transfer shares first
        _accrue(from);
        _accrue(to);
        Investor storage f = investors[from];
        require(amount <= f.fundsInvested, "Exceeds stake");
        f.fundsInvested -= amount;
        investors[to].fundsInvested += amount;
        emit Transfer(from, to, amount);
    }

    // ------------------------------------------------------------------ views

    function getApprovers(uint proposalId) public view returns (address[] memory) {
        return approvers[proposalId];
    }

    function releasedAmount(uint proposalId) external view returns (uint) {
        return _releasedAmount(proposals[proposalId]);
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
