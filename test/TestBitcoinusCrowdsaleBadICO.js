const BigNumber = require('bignumber.js');

const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.use(require('chai-bignumber')(BigNumber));

const expect = chai.expect;

const OneEther = new BigNumber(web3.toWei(1, 'ether'));
const OneToken = new BigNumber(web3.toWei(1, 'ether'));

const BitcoinusCrowdsale = artifacts.require("test/TestBitcoinusCrowdsale.sol");
const BitcoinusToken = artifacts.require("../contracts/BitcoinusToken.sol");

contract('BitcoinusCrowdsale Bad ICO', async (accounts) => {
	let contract;
	let token;
	let rate;
	let start;
	let end;
	before(async () => {
		token = await BitcoinusToken.new();
		contract = await BitcoinusCrowdsale.new(token.address);
		await token.transferOwnership(contract.address);
		await contract.setNow(0);
		[start, end, rate] = await Promise.all([contract.START_TIME(), contract.END_TIME(), contract.RATE()]);
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
			}))
			.to.be.eventually.rejected;
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

		const balanceBefore = await token.balanceOf(accounts[1]);

		await contract.setNow(1519876800 + 1);
		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther,
			gas: 200000
		});

		expect(await contract.currentStage()).to.be.bignumber.equal(1);

		const balanceAfter = await token.balanceOf(accounts[1]);
		const tokens = OneEther.mul(rate).mul(100).div(100 - 40).floor();
		const bonusTokens = tokens.mul(5).div(100).floor();
		const expectedTokens = tokens.add(bonusTokens);

		expect(balanceAfter.minus(balanceBefore)).to.be.bignumber.equal(expectedTokens);
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

	it('Have 3 Ether in refundVault', async () => {
		expect(await web3.eth.getBalance(await contract.vault())).to.be.bignumber.equal(OneEther.mul(3));
	});

	it('Should not be able to Finalize ICO before end time', async () => {
		await expect(contract.finalize()).eventually.rejected;
	});

	it('Should successfully finalize unsuccessfull ICO', async () => {
		await contract.setNow(end.add(1));
		const tokens = await token.totalSupply();
		await expect(contract.finalize()).eventually.fulfilled;
		expect(await token.totalSupply()).to.be.bignumber.equal(tokens);
	});

	it('Should be possible to get refund', async () => {
		let etherBalanceBefore = web3.fromWei(await web3.eth.getBalance(accounts[1]));

		await contract.sendTransaction({
			from: accounts[1],
			value: 0
		});

		let etherBalanceAfter = web3.fromWei(await web3.eth.getBalance(accounts[1]));

		expect(etherBalanceAfter - etherBalanceBefore).to.be.closeTo(3, 0.01);
	});
});