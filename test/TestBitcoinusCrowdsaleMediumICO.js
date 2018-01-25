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

contract('BitcoinusCrowdsale Medium ICO', async (accounts) => {
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

	it('should correctly pass from stage 1 to stage 4', async () => {
		await contract.setNow(1525219200 + 1);
		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther,
			gas: 200000
		});

		expect(await contract.currentStage()).to.be.bignumber.equal(4);
	});

	it('Have 5002 Ether on balance', async () => {
		const walletBalanceAfter = await web3.eth.getBalance(await contract.WALLET());
		const balance = walletBalanceAfter.sub(walletBalance).add(await web3.eth.getBalance(await contract.vault()));

		expect(balance).to.be.bignumber.equal(OneEther.mul(5002));
	});

	it('Should not be able to Finalize ICO before end time', async () => {
		await expect(contract.finalize()).eventually.rejected;
	});

	it('Should successfully finalize successfull ICO', async () => {
		const wallet = await contract.WALLET();

		await contract.setNow(end.add(1));
		await expect(contract.finalize()).eventually.fulfilled;

		const etherBalanceAfter = await web3.eth.getBalance(wallet);
		expect(web3.fromWei(etherBalanceAfter.sub(walletBalance)).toNumber()).to.be.closeTo(5002, 0.01);
	});

	it('Should not be possible to get refund', async () => {
		await expect(contract.sendTransaction({
			from: accounts[1],
			value: 0
		})).eventually.rejected;
	});

	it('should change token owner to 0x1', async () => {
		expect(await token.owner()).to.be.equal('0x0000000000000000000000000000000000000001');
	});

	it('should finish minting', async () => {
		expect(await token.mintingFinished()).to.be.equal(true);
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
});