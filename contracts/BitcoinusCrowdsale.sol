pragma solidity ^0.4.18;

import 'zeppelin-solidity/contracts/crowdsale/RefundVault.sol';
import 'zeppelin-solidity/contracts/ownership/Ownable.sol';
import 'zeppelin-solidity/contracts/token/TokenTimelock.sol';
import './BitcoinusToken.sol';

contract BitcoinusCrowdsale is Ownable {
	using SafeMath for uint256;
	// Wallet where all ether will be stored
	address public constant WALLET = 0x3f39CD8a8Ae0540F0FD38aB695D36ceCf0f254E3;
	// Wallet for team tokens
	address public constant TEAM_WALLET = 0x35317879205E9fd59AeeC429b5494B84D8507C20;
	// Wallet for bounty tokens
	address public constant BOUNTY_WALLET = 0x088C48cA51A024909f06DF60597492492Eb66C2a;
	// Wallet for company tokens
	address public constant COMPANY_WALLET = 0x576B5cA75d4598dC31640F395F6201C5Dd0EbbB4;

	uint256 public constant TEAM_TOKENS = 4000000e18;
	uint256 public constant TEAM_TOKENS_LOCK_PERIOD = 60 * 60 * 24 * 365; // 365 days
	uint256 public constant COMPANY_TOKENS = 10000000e18;
	uint256 public constant COMPANY_TOKENS_LOCK_PERIOD = 60 * 60 * 24 * 180; // 180 days
	uint256 public constant BOUNTY_TOKENS = 1000000e18;
	uint256 public constant SOFT_CAP = 3000000e18;
	uint256 public constant ICO_TOKENS = 50000000e18;
	uint256 public constant START_TIME = 1516579200; // 2018/01/22 00:00 UTC +0
	uint256 public constant END_TIME = 1525996800; // 2018/05/11 00:00 UTC +0
	uint256 public constant RATE = 1000;
	uint256 public constant LARGE_PURCHASE = 1500e18;
	uint256 public constant LARGE_PURCHASE_BONUS = 5;

	Stage[] stages;

	struct Stage {
		uint256 till;
		uint256 cap;
		uint8 discount;
	}

	// The token being sold
	BitcoinusToken public token;

	// amount of raised money in wei
	uint256 public weiRaised;

	// refund vault used to hold funds while crowdsale is running
  	RefundVault public vault;

	uint256 public currentStage = 0;
    bool public isFinalized = false;

	address tokenMinter;

	TokenTimelock public teamTimelock;
	TokenTimelock public companyTimelock;

	/**
	* event for token purchase logging
	* @param purchaser who paid for the tokens
	* @param beneficiary who got the tokens
	* @param value weis paid for purchase
	* @param amount amount of tokens purchased
	*/
	event TokenPurchase(address indexed purchaser, address indexed beneficiary, uint256 value, uint256 amount);

	event Finalized();
	/**
	 * When there no tokens left to mint and token minter tries to manually mint tokens
	 * this event is raised to signal how many tokens we have to charge back to purchaser
	 */
	event ManualTokenMintRequiresRefund(address indexed purchaser, uint256 value);

	function BitcoinusCrowdsale(address _token) public {
		stages.push(Stage({ till: 1519344000, discount: 47, cap: 8000000e18 })); // 2018/02/23 00:00 UTC +0
		stages.push(Stage({ till: 1521849600, discount: 40, cap: 17000000e18 })); // 2018/03/24 00:00 UTC +0
		stages.push(Stage({ till: 1523836800, discount: 30, cap: 15000000e18 })); // 2018/04/16 00:00 UTC +0
		stages.push(Stage({ till: 1525219200, discount: 15, cap: 7000000e18 })); // 2018/05/02 00:00 UTC +0
		stages.push(Stage({ till: 1525996800, discount: 5, 	cap: 3000000e18 })); // 2018/05/11 00:00 UTC +0

		token = BitcoinusToken(_token);
		vault = new RefundVault(WALLET);
		tokenMinter = msg.sender;
	}

	modifier onlyTokenMinterOrOwner() {
		require(msg.sender == tokenMinter || msg.sender == owner);
		_;
	}

	// low level token purchase function
	function buyTokens(address beneficiary) public payable {
		require(beneficiary != address(0));
		require(validPurchase());

		uint256 weiAmount = msg.value;
		uint256 nowTime = getNow();
		// this loop moves stages and insures correct stage according to date
		while (currentStage < stages.length && stages[currentStage].till < nowTime) {
			stages[stages.length - 1].cap = stages[stages.length - 1].cap.add(stages[currentStage].cap); // move all unsold tokens to last stage
			stages[currentStage].cap = 0;
			currentStage = currentStage.add(1);
		}

		// calculate token amount to be created
		uint256 tokens = calculateTokens(weiAmount);

		uint256 excess = appendContribution(beneficiary, tokens);

		if (excess > 0) { // hard cap reached, no more tokens to mint
			uint256 refund = excess.mul(weiAmount).div(tokens);
			weiAmount = weiAmount.sub(refund);
			msg.sender.transfer(refund);
		}

		// update state
		weiRaised = weiRaised.add(weiAmount);
		TokenPurchase(msg.sender, beneficiary, weiAmount, tokens.sub(excess));

		if (goalReached()) {
			WALLET.transfer(weiAmount);
		} else {
			vault.deposit.value(weiAmount)(msg.sender);
		}
	}

	function calculateTokens(uint256 _weiAmount) internal view returns (uint256) {
		uint256 tokens = _weiAmount.mul(RATE).mul(100).div(uint256(100).sub(stages[currentStage].discount));

		uint256 bonus = 0;
		if (currentStage > 0 && tokens >= LARGE_PURCHASE) {
			bonus = tokens.mul(LARGE_PURCHASE_BONUS).div(100);
		}

		return tokens.add(bonus);
	}

	function appendContribution(address _beneficiary, uint256 _tokens) internal returns (uint256) {
		uint256 excess = _tokens;
		uint256 tokensToMint = 0;

		while (excess > 0 && currentStage < stages.length) {
			Stage storage stage = stages[currentStage];
			if (excess >= stage.cap) {
				excess = excess.sub(stage.cap);
				tokensToMint = tokensToMint.add(stage.cap);
				stage.cap = 0;
				currentStage = currentStage.add(1);
			} else {
				stage.cap = stage.cap.sub(excess);
				tokensToMint = tokensToMint.add(excess);
				excess = 0;
			}
		}
		token.mint(_beneficiary, tokensToMint);
		return excess;
	}

	// @return true if the transaction can buy tokens
	function validPurchase() internal view returns (bool) {
		bool withinPeriod = getNow() >= START_TIME && getNow() <= END_TIME;
		bool nonZeroPurchase = msg.value != 0;
		bool canMint = token.totalSupply() < ICO_TOKENS;
		bool validStage = (currentStage < stages.length);
		return withinPeriod && nonZeroPurchase && canMint && validStage;
	}

 	// if crowdsale is unsuccessful, investors can claim refunds here
  	function claimRefund() public {
	    require(isFinalized);
	    require(!goalReached());

	    vault.refund(msg.sender);
	}

	/**
   	* @dev Must be called after crowdsale ends, to do some extra finalization
   	* work. Calls the contract's finalization function.
   	*/
  	function finalize() onlyOwner public {
    	require(!isFinalized);
    	require(hasEnded());

     	if (goalReached()) {
			vault.close();

			teamTimelock = new TokenTimelock(token, TEAM_WALLET, getNow().add(TEAM_TOKENS_LOCK_PERIOD));
			token.mint(teamTimelock, TEAM_TOKENS);

			companyTimelock = new TokenTimelock(token, COMPANY_WALLET, getNow().add(COMPANY_TOKENS_LOCK_PERIOD));
			token.mint(companyTimelock, COMPANY_TOKENS);

			token.mint(BOUNTY_WALLET, BOUNTY_TOKENS);

			token.finishMinting();
			token.transferOwnership(0x1);
    	} else {
	      	vault.enableRefunds();
    	}

    	Finalized();

    	isFinalized = true;
  	}

	// @return true if crowdsale event has ended
	function hasEnded() public view returns (bool) {
		return getNow() > END_TIME || token.totalSupply() == ICO_TOKENS;
	}

  	function goalReached() public view returns (bool) {
    	return token.totalSupply() >= SOFT_CAP;
  	}

    // fallback function can be used to buy tokens or claim refund
  	function () external payable {
  		if (!isFinalized) {
    		buyTokens(msg.sender);
		} else {
			claimRefund();
    	}
  	}

  	function mintTokens(address[] _receivers, uint256[] _amounts) external onlyTokenMinterOrOwner {
		require(_receivers.length > 0 && _receivers.length <= 100);
		require(_receivers.length == _amounts.length);
		require(!isFinalized);
		for (uint256 i = 0; i < _receivers.length; i++) {
			address receiver = _receivers[i];
			uint256 amount = _amounts[i];

	  		require(receiver != address(0));
	  		require(amount > 0);

	  		uint256 excess = appendContribution(receiver, amount);

	  		if (excess > 0) {
	  			ManualTokenMintRequiresRefund(receiver, excess);
	  		}
		}
  	}

  	function setTokenMinter(address _tokenMinter) public onlyOwner {
  		require(_tokenMinter != address(0));
  		tokenMinter = _tokenMinter;
  	}

	function getNow() internal view returns (uint256) {
		return now;
	}
}