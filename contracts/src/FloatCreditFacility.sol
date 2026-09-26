// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title FloatCreditFacility
 * @notice Authoritative financial ledger for Float's credit facilities on Arc.
 *         Tracks human credit profiles, authorized AI agents, drawdowns, and repayments.
 *         Important: Drawdowns record and authorize credit; actual x402 payment
 *         is executed via Float's Gateway funding balance.
 */
contract FloatCreditFacility {
    address public owner;
    IERC20Minimal public usdc;

    enum ProfileStatus { Inactive, Active, Suspended, Defaulted }
    enum LoanStatus { Active, Settled, Defaulted }

    struct CreditProfile {
        bytes32 profileId;
        address humanOwner;
        bytes32 humanRoot;        // World ID root or reference hash
        uint256 creditLimit;      // e.g., 500 * 1e6 ($500.00 USDC)
        uint256 outstandingDebt;
        uint256 totalBorrowed;
        uint256 totalRepaid;
        ProfileStatus status;
        uint256 createdAt;
    }

    struct AgentAuthorization {
        bytes32 profileId;
        bool isActive;
        uint256 authorizedAt;
    }

    /**
     * One drawdown row, laid out to fit four storage slots.
     *
     * The reference used to be a string. A resource URL ran to three slots -
     * roughly 60,000 gas - to annotate a payment worth a cent, so it is a hash
     * now; the readable form lives off-chain and the hash proves which one it
     * was. The remaining fields are ordered to pack: an address, a timestamp
     * and a status share one slot, and an amount, a loan id and a payment count
     * share the next.
     *
     * paymentCount is what makes a row a batch. One x402 payment is a batch of
     * one; fifty of them settled together are a batch of fifty, and cost the
     * same to record.
     */
    struct Drawdown {
        bytes32 profileId;
        address agentAddress;
        uint64 timestamp;
        LoanStatus status;
        uint128 amount;
        uint64 loanId;
        uint32 paymentCount;
        bytes32 referenceHash;
    }

    struct RepaymentRecord {
        uint256 repaymentId;
        bytes32 profileId;
        address payer;
        address beneficiaryAgent;
        uint256 amount;
        uint256 timestamp;
    }

    // Storage
    mapping(bytes32 => CreditProfile) public profiles;
    bytes32[] public profileIds;
    mapping(address => bytes32) public humanToProfile;
    mapping(address => AgentAuthorization) public agentAuthorizations;
    mapping(uint256 => Drawdown) public drawdowns;
    uint256 public nextLoanId = 1;
    mapping(uint256 => RepaymentRecord) public repayments;
    uint256 public nextRepaymentId = 1;

    /// @notice One World ID nullifier maps to exactly one profile. Without this the
    /// per-human exposure cap is unenforceable: a single human can open unlimited
    /// profiles and each carries its own limit.
    mapping(bytes32 => bytes32) public humanRootToProfile;

    // Events explicitly indexed for Subgraph / Substreams
    event CreditProfileCreated(bytes32 indexed profileId, address indexed humanOwner, bytes32 humanRoot, uint256 creditLimit);
    event CreditLimitUpdated(bytes32 indexed profileId, uint256 oldLimit, uint256 newLimit);
    event ProfileStatusChanged(bytes32 indexed profileId, ProfileStatus status);
    event AgentAuthorized(bytes32 indexed profileId, address indexed agentAddress, uint256 timestamp);
    event AgentRevoked(bytes32 indexed profileId, address indexed agentAddress, uint256 timestamp);
    event DrawdownRecorded(
        uint256 indexed loanId,
        bytes32 indexed profileId,
        address indexed agentAddress,
        uint256 amount,
        uint256 newOutstandingDebt,
        uint256 timestamp,
        uint32 paymentCount,
        bytes32 referenceHash
    );
    event RepaymentRecorded(
        uint256 indexed repaymentId,
        bytes32 indexed profileId,
        address indexed payer,
        address beneficiaryAgent,
        uint256 amount,
        uint256 remainingDebt,
        uint256 timestamp
    );
    event DefaultMarked(bytes32 indexed profileId, uint256 outstandingDebt, uint256 timestamp);
    event Withdrawn(address indexed to, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "FloatCreditFacility: not contract owner");
        _;
    }

    constructor(address _usdc) {
        owner = msg.sender;
        if (_usdc != address(0)) {
            usdc = IERC20Minimal(_usdc);
        }
    }

    function setToken(address _usdc) external onlyOwner {
        usdc = IERC20Minimal(_usdc);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        owner = newOwner;
    }

    /**
     * @notice Creates or activates a Human Credit Profile.
     */
    function createCreditProfile(
        bytes32 profileId,
        address humanOwner,
        bytes32 humanRoot,
        uint256 initialCreditLimit
    ) external {
        require(msg.sender == owner || msg.sender == humanOwner, "Unauthorized");
        require(profiles[profileId].createdAt == 0, "Profile already exists");
        require(humanOwner != address(0), "Invalid human owner");

        if (msg.sender == owner) {
            // Float underwrites every profile from a single operator wallet, so
            // the humanOwner address says nothing about uniqueness here. The
            // World nullifier is what makes a human unique, and an underwritten
            // profile without one would have no Sybil control at all.
            require(humanRoot != bytes32(0), "Underwritten profile needs a human root");
        } else {
            // Self-registration: the caller really is the human, so one address
            // gets one profile. It carries no credit either way.
            require(humanToProfile[humanOwner] == bytes32(0), "Human already has a profile");
        }

        if (humanRoot != bytes32(0)) {
            require(humanRootToProfile[humanRoot] == bytes32(0), "Human root already used");
        }

        // Anyone may register themselves, but only the underwriter may extend
        // credit. A self-registered profile starts at a zero limit and stays
        // there until setCreditLimit is called by the operator.
        uint256 limit = msg.sender == owner ? initialCreditLimit : 0;

        profiles[profileId] = CreditProfile({
            profileId: profileId,
            humanOwner: humanOwner,
            humanRoot: humanRoot,
            creditLimit: limit,
            outstandingDebt: 0,
            totalBorrowed: 0,
            totalRepaid: 0,
            status: ProfileStatus.Active,
            createdAt: block.timestamp
        });

        profileIds.push(profileId);
        if (msg.sender != owner) humanToProfile[humanOwner] = profileId;
        if (humanRoot != bytes32(0)) humanRootToProfile[humanRoot] = profileId;

        emit CreditProfileCreated(profileId, humanOwner, humanRoot, limit);
    }

    /**
     * @notice Set or update the credit limit of a human profile.
     */
    /// @dev Underwriter only. A borrower who can set their own limit is not a borrower.
    function setCreditLimit(bytes32 profileId, uint256 newLimit) external onlyOwner {
        CreditProfile storage profile = profiles[profileId];
        require(profile.createdAt > 0, "Profile does not exist");

        uint256 oldLimit = profile.creditLimit;
        profile.creditLimit = newLimit;

        emit CreditLimitUpdated(profileId, oldLimit, newLimit);
    }

    /**
     * @notice Update the operational status of a profile (Active, Suspended, Defaulted).
     */
    /// @dev Underwriter only. Previously the profile owner could clear their own
    /// default and resume borrowing.
    function setProfileStatus(bytes32 profileId, ProfileStatus status) external onlyOwner {
        CreditProfile storage profile = profiles[profileId];
        require(profile.createdAt > 0, "Profile does not exist");

        profile.status = status;
        emit ProfileStatusChanged(profileId, status);
    }

    /// @notice A human may always suspend their own profile - that direction is
    /// self-limiting and needs no permission. Only the underwriter can re-activate.
    function suspendOwnProfile(bytes32 profileId) external {
        CreditProfile storage profile = profiles[profileId];
        require(profile.createdAt > 0, "Profile does not exist");
        require(msg.sender == profile.humanOwner, "Not the profile owner");

        profile.status = ProfileStatus.Suspended;
        emit ProfileStatusChanged(profileId, ProfileStatus.Suspended);
    }

    /**
     * @notice Authorize an AI agent to draw against the human credit facility.
     */
    function authorizeAgent(bytes32 profileId, address agentAddress) external {
        CreditProfile storage profile = profiles[profileId];
        require(profile.createdAt > 0, "Profile does not exist");
        require(msg.sender == owner || msg.sender == profile.humanOwner, "Unauthorized");
        require(agentAddress != address(0), "Invalid agent address");

        agentAuthorizations[agentAddress] = AgentAuthorization({
            profileId: profileId,
            isActive: true,
            authorizedAt: block.timestamp
        });

        emit AgentAuthorized(profileId, agentAddress, block.timestamp);
    }

    /**
     * @notice Revoke an AI agent's authorization.
     */
    function revokeAgent(bytes32 profileId, address agentAddress) external {
        CreditProfile storage profile = profiles[profileId];
        require(profile.createdAt > 0, "Profile does not exist");
        require(msg.sender == owner || msg.sender == profile.humanOwner, "Unauthorized");
        require(agentAuthorizations[agentAddress].profileId == profileId, "Agent not associated with profile");

        agentAuthorizations[agentAddress].isActive = false;

        emit AgentRevoked(profileId, agentAddress, block.timestamp);
    }

    /**
     * @notice Records an overdraft credit drawdown against the human facility.
     *         Enforces credit limit and authorization.
     *         Actual payment is made via Float Gateway funding balance.
     */
    /**
     * @notice Record a drawdown against a profile.
     * @param paymentCount How many payments this row settles. One for a single
     * draw; N when an off-chain accumulator flushes N nanopayments at once.
     * Recording fifty cent-payments individually costs fifty times the gas for
     * the same debt, which is more than the payments are worth.
     * @param referenceHash keccak of the human-readable reference, which is kept
     * off-chain. A hash is one slot; the string it replaces was three.
     */
    function recordDrawdown(
        bytes32 profileId,
        address agentAddress,
        uint256 amount,
        uint32 paymentCount,
        bytes32 referenceHash
    ) external returns (uint256 loanId) {
        require(paymentCount > 0, "Batch must cover at least one payment");
        require(amount <= type(uint128).max, "Amount too large");
        CreditProfile storage profile = profiles[profileId];
        require(profile.createdAt > 0, "Profile does not exist");
        require(profile.status == ProfileStatus.Active, "Profile is not active");

        // Validate agent authorization
        AgentAuthorization storage auth = agentAuthorizations[agentAddress];
        require(auth.isActive && auth.profileId == profileId, "Agent not authorized for this profile");

        // Validate caller (contract owner/operator, human owner, or authorized agent)
        require(
            msg.sender == owner || msg.sender == profile.humanOwner || msg.sender == agentAddress,
            "Unauthorized drawdown caller"
        );

        // Check credit headroom
        require(profile.outstandingDebt + amount <= profile.creditLimit, "Requested drawdown exceeds credit limit");

        profile.outstandingDebt += amount;
        profile.totalBorrowed += amount;

        loanId = nextLoanId++;
        drawdowns[loanId] = Drawdown({
            profileId: profileId,
            agentAddress: agentAddress,
            timestamp: uint64(block.timestamp),
            status: LoanStatus.Active,
            amount: uint128(amount),
            loanId: uint64(loanId),
            paymentCount: paymentCount,
            referenceHash: referenceHash
        });

        emit DrawdownRecorded(
            loanId,
            profileId,
            agentAddress,
            amount,
            profile.outstandingDebt,
            block.timestamp,
            paymentCount,
            referenceHash
        );
    }

    /**
     * @notice Records a repayment against the human profile.
     *         Any authorized payer (agent or human) can repay debt.
     *         Excess repayment is not deducted from debt.
     */
    /// @dev Underwriter only, and it moves no tokens - it books a repayment the
    /// operator has already observed settle off-chain. Previously any address could
    /// call this with payer = itself and clear anyone's debt for free.
    /// For an on-chain repayment that actually transfers value, use repayWithToken.
    function recordRepayment(
        bytes32 profileId,
        address payer,
        address beneficiaryAgent,
        uint256 amount
    ) external onlyOwner returns (uint256 actualRepaid, uint256 remainingDebt) {
        CreditProfile storage profile = profiles[profileId];
        require(profile.createdAt > 0, "Profile does not exist");
        require(profile.outstandingDebt > 0, "No outstanding debt to repay");

        actualRepaid = amount > profile.outstandingDebt ? profile.outstandingDebt : amount;
        profile.outstandingDebt -= actualRepaid;
        profile.totalRepaid += actualRepaid;
        remainingDebt = profile.outstandingDebt;

        uint256 repId = nextRepaymentId++;
        repayments[repId] = RepaymentRecord({
            repaymentId: repId,
            profileId: profileId,
            payer: payer,
            beneficiaryAgent: beneficiaryAgent,
            amount: actualRepaid,
            timestamp: block.timestamp
        });

        emit RepaymentRecorded(
            repId,
            profileId,
            payer,
            beneficiaryAgent,
            actualRepaid,
            remainingDebt,
            block.timestamp
        );
    }

    /**
     * @notice On-chain USDC repayment where tokens are transferred directly into this contract.
     */
    function repayWithToken(
        bytes32 profileId,
        address beneficiaryAgent,
        uint256 amount
    ) external returns (uint256 actualRepaid, uint256 remainingDebt) {
        require(address(usdc) != address(0), "USDC token not configured");
        CreditProfile storage profile = profiles[profileId];
        require(profile.createdAt > 0, "Profile does not exist");
        require(profile.outstandingDebt > 0, "No outstanding debt");

        actualRepaid = amount > profile.outstandingDebt ? profile.outstandingDebt : amount;

        // Effects before interactions: a reentrant token could otherwise repay the
        // same debt twice. USDC is not reentrant, but the ordering should not depend
        // on which token is configured.
        profile.outstandingDebt -= actualRepaid;
        profile.totalRepaid += actualRepaid;
        remainingDebt = profile.outstandingDebt;

        require(usdc.transferFrom(msg.sender, address(this), actualRepaid), "USDC transferFrom failed");

        uint256 repId = nextRepaymentId++;
        repayments[repId] = RepaymentRecord({
            repaymentId: repId,
            profileId: profileId,
            payer: msg.sender,
            beneficiaryAgent: beneficiaryAgent,
            amount: actualRepaid,
            timestamp: block.timestamp
        });

        emit RepaymentRecorded(
            repId,
            profileId,
            msg.sender,
            beneficiaryAgent,
            actualRepaid,
            remainingDebt,
            block.timestamp
        );
    }

    /**
     * @notice Mark a profile as defaulted if loans remain unpaid past terms.
     */
    function markDefault(bytes32 profileId) external onlyOwner {
        CreditProfile storage profile = profiles[profileId];
        require(profile.createdAt > 0, "Profile does not exist");
        require(profile.outstandingDebt > 0, "No outstanding debt");

        profile.status = ProfileStatus.Defaulted;
        emit DefaultMarked(profileId, profile.outstandingDebt, block.timestamp);
    }

    /// @notice Withdraw repaid capital. Without this, every token repaid through
    /// repayWithToken is permanently stranded in the contract.
    function withdraw(address to, uint256 amount) external onlyOwner {
        require(address(usdc) != address(0), "USDC token not configured");
        require(to != address(0), "Invalid recipient");
        require(usdc.transfer(to, amount), "USDC transfer failed");
        emit Withdrawn(to, amount);
    }

    // View functions
    function getProfile(bytes32 profileId) external view returns (CreditProfile memory) {
        return profiles[profileId];
    }

    function getRemainingCredit(bytes32 profileId) external view returns (uint256) {
        CreditProfile memory p = profiles[profileId];
        if (p.status != ProfileStatus.Active) return 0;
        return p.creditLimit > p.outstandingDebt ? p.creditLimit - p.outstandingDebt : 0;
    }

    function getOutstandingDebt(bytes32 profileId) external view returns (uint256) {
        return profiles[profileId].outstandingDebt;
    }

    function isAgentAuthorized(bytes32 profileId, address agentAddress) external view returns (bool) {
        AgentAuthorization memory auth = agentAuthorizations[agentAddress];
        return auth.isActive && auth.profileId == profileId;
    }

    function getAgentProfileId(address agentAddress) external view returns (bytes32) {
        return agentAuthorizations[agentAddress].profileId;
    }

    function getDrawdown(uint256 loanId) external view returns (Drawdown memory) {
        return drawdowns[loanId];
    }

    function getProfileCount() external view returns (uint256) {
        return profileIds.length;
    }
}
