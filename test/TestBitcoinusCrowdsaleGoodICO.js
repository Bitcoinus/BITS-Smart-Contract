const BigNumber = require('bignumber.js');

const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.use(require('chai-bignumber')(BigNumber));

const expect = chai.expect;

const OneEther = new BigNumber(web3.toWei(1, 'ether'));
const OneToken = new BigNumber(web3.toWei(1, 'ether'));

const BitcoinusCrowdsale = artifacts.require("test/TestBitcoinusCrowdsale.sol");
const BitcoinusToken = artifacts.require("../contracts/BitcoinusToken.sol");
const RefundVault = artifacts.require("zeppelin-solidity/contracts/crowdsale/RefundVault.sol");
const TokenTimelock = artifacts.require("zeppelin-solidity/contracts/token/TokenTimelock.sol");

contract('BitcoinusCrowdsale Good ICO', async (accounts) => {
	let contract;
	let token;
	let rate;
	let start;
	let end;
	let walletBalance;
	before(async () => {
		token = await BitcoinusToken.new();
		contract = await BitcoinusCrowdsale.new(token.address);
		await token.transferOwnership(contract.address);
		await contract.setNow(0);
		[start, end, rate] = await Promise.all([contract.START_TIME(), contract.END_TIME(), contract.RATE()]);
		walletBalance = await web3.eth.getBalance(await contract.WALLET());
	});

	it('should always work', () => {});

	it('ICO period should be 109 days', async () => {
		const icoDaysInSecs = (60 * 60 * 24 * 109);
		const period = (end - start);

		expect(period).to.be.equal(icoDaysInSecs);
	});

	it('should not accept funds before ICO start', async () => {
		await expect(contract.sendTransaction({
			from: accounts[1],
			value: OneEther
		})).eventually.rejected;
	});

	it('Should accept funds after startTime', async () => {
		const balanceBefore = await token.balanceOf(accounts[1]);
		expect(balanceBefore).to.be.bignumber.equal(0);
		await contract.setNow(start.add(1));

		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther,
			gas: 200000
		});
		const balanceAfter = await token.balanceOf(accounts[1]);
		const expectedTokens = OneEther.mul(rate).mul(100).div(100 - 47).floor();
		expect(balanceAfter).to.be.bignumber.equal(expectedTokens);
	});

	it('fails to transfer tokens before ICO end', async () => {
		await expect(token.transfer(accounts[2], OneToken, {from : accounts[1]})).eventually.rejected;
	});

	it('should correctly pass from stage 0 to stage 1', async () => {
		let balanceBefore = await token.balanceOf(accounts[1]);

		await contract.setNow(1519876800 + 1);
		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther.mul(5000),
			gas: 200000
		});

		expect(await contract.currentStage()).to.be.bignumber.equal(1);

		const balanceAfter = await token.balanceOf(accounts[1]);
		const tokens = OneEther.mul(5000).mul(rate).mul(100).div(100 - 40).floor();
		const bonusTokens = tokens.mul(5).div(100).floor();
		const expectedTokens = tokens.add(bonusTokens);
		expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(expectedTokens);
	});

	it('should correctly pass from stage 1 to stage 2', async () => {
		await contract.setNow(1522555200 + 1);
		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther,
			gas: 200000
		});

		expect(await contract.currentStage()).to.be.bignumber.equal(2);
	});

	it('should correctly pass from stage 2 to stage 3', async () => {
		await contract.setNow(1523851200 + 1);
		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther,
			gas: 200000
		});

		expect(await contract.currentStage()).to.be.bignumber.equal(3);
	});

	it('should correctly pass from stage 3 to stage 4', async () => {
		await contract.setNow(1525219200 + 1);
		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther,
			gas: 200000
		});

		expect(await contract.currentStage()).to.be.bignumber.equal(4);
	});

	it('Have 5004 Ether in refundVault', async () => {
		const walletBalanceAfter = await web3.eth.getBalance(await contract.WALLET());
		const balance = walletBalanceAfter.sub(walletBalance).add(await web3.eth.getBalance(await contract.vault()));

		expect(balance).to.be.bignumber.equal(OneEther.mul(5004));
	});

	it('Should send ether until token cap', async () => {
		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther.mul(25000),
			gas: 200000
		});

		const [totalSupply, tokenCap, balanceBefore] =
			await Promise.all([token.totalSupply(), contract.ICO_TOKENS(), token.balanceOf(accounts[1])]);

		const tokensToMint = tokenCap.sub(totalSupply);

		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther.mul(20000),
			gas: 300000
		});

		const balanceAfter = await token.balanceOf(accounts[1]);

		expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(tokensToMint);
		expect(await token.totalSupply()).to.be.bignumber.equal(tokenCap);
	});

	it('Should successfully finalize successfull ICO before end', async () => {
		const wallet = await contract.WALLET();

		await contract.setNow(end.sub(1));
		await expect(contract.finalize()).eventually.fulfilled;
	});

	it('Should not be possible to get refund', async () => {
		await expect(contract.sendTransaction({
			from: accounts[1],
			value: 0
		})).eventually.rejected;
	});

	it('should change token owner to 0x1', async () => {
		const owner = await token.owner();
		expect(owner).to.be.equal('0x0000000000000000000000000000000000000001');
	});

	it('should finish minting', async () => {
		expect(await token.mintingFinished()).to.be.equal(true);
	});

	it('succeeds to transfer tokens after ICO end', async () => {
		const balanceBefore = await token.balanceOf(accounts[2]);
		await expect(token.transfer(accounts[2], OneToken, {from : accounts[1]})).eventually.fulfilled;
		const balanceAfter = await token.balanceOf(accounts[2]);
		expect(balanceAfter.sub(balanceBefore)).to.be.bignumber.equal(OneToken);
	});

	it('should close vault', async () => {
		const vault = await RefundVault.at(await contract.vault());
		expect(await vault.state()).to.be.bignumber.equal(2); // Closed
	});

	it('should correctly initialize TokenTimelock', async () => {
		const teamTimelockAddr = await contract.teamTimelock();
		const companyTimelockAddr = await contract.companyTimelock();
		expect(teamTimelockAddr).not.to.be.equal('0x0000000000000000000000000000000000000000');
		expect(companyTimelockAddr).not.to.be.equal('0x0000000000000000000000000000000000000000');

		const teamTimelock = await TokenTimelock.at(teamTimelockAddr);
		const companyTimelock = await TokenTimelock.at(companyTimelockAddr);

		const [
			nowTime,
			teamAddr,
			teamReleaseTime,
			companyAddr,
			companyReleaseTime,
			teamBalance,
			companyBalance,
			teamWallet,
			teamTokensLockPeriod,
			teamTokens,
			bountyWallet,
			bountyTokens,
			companyWallet,
			companyTokens,
			companyTokensLockPeriod
			]
			=
			await Promise.all([
				contract.getNowTest(),
				teamTimelock.beneficiary(),
				teamTimelock.releaseTime(),
				companyTimelock.beneficiary(),
				companyTimelock.releaseTime(),
				token.balanceOf(teamTimelockAddr),
				token.balanceOf(companyTimelockAddr),
				contract.TEAM_WALLET(),
				contract.TEAM_TOKENS_LOCK_PERIOD(),
				contract.TEAM_TOKENS(),
				contract.BOUNTY_WALLET(),
				contract.BOUNTY_TOKENS(),
				contract.COMPANY_WALLET(),
				contract.COMPANY_TOKENS(),
				contract.COMPANY_TOKENS_LOCK_PERIOD()
			]);

		expect(teamAddr).to.be.equal(teamWallet);

		expect(teamReleaseTime).to.be.bignumber.equal(teamTokensLockPeriod.add(nowTime));
		expect(teamBalance).to.be.bignumber.equal(teamTokens);
		expect(companyAddr).to.be.equal(companyWallet);
		expect(companyReleaseTime).to.be.bignumber.equal(companyTokensLockPeriod.add(nowTime));
		expect(companyBalance).to.be.bignumber.equal(companyTokens);
		expect(await token.balanceOf(bountyWallet)).to.be.bignumber.equal(bountyTokens);
	});

	it('should mint all tokens', async () => {
		const [totalSupply, icoTokens, teamTokens, bountyTokens, companyTokens] =
			await Promise.all([token.totalSupply(), contract.ICO_TOKENS(), contract.TEAM_TOKENS(), contract.BOUNTY_TOKENS(), contract.COMPANY_TOKENS()]);
		expect(totalSupply).to.be.bignumber.equal(icoTokens.add(teamTokens).add(bountyTokens).add(companyTokens));
	});

});