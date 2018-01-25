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

contract('BitcoinusCrowdsale Complex ICO', async (accounts) => {
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

	it('should manually mint tokens',  async () => {
		let receivers = [];
		let amounts = [];
		for (let i = 0; i < 100; i++) {
			receivers.push(accounts[1]);
			amounts.push(OneToken);
		}
		await expect(contract.mintTokens(receivers, amounts)).eventually.fulfilled;

		expect(await token.balanceOf(accounts[1])).to.be.bignumber.equal(OneToken.mul(100));
	});

	it('manual minting moves stages', async () => {
		const stageBefore = await contract.currentStage();

		let receivers = [];
		let amounts = [];
		for (let i = 0; i < 100; i++) {
			receivers.push(accounts[1]);
			amounts.push(OneToken.mul(100000));
		}
		await expect(contract.mintTokens(receivers, amounts)).eventually.fulfilled;

		expect(await token.balanceOf(accounts[1])).to.be.bignumber.equal(OneToken.mul(100000).mul(100).add(OneToken.mul(100)));
		expect(stageBefore).to.be.bignumber.equal(0);
		expect(await contract.currentStage()).to.be.bignumber.equal(1);
	});

	it('ether transfers moves multiple stages', async () => {
		await contract.setNow(1519876800);
		const stageBefore = await contract.currentStage();

		await contract.sendTransaction({
			from: accounts[1],
			value: OneEther.mul(20000),
			gas: 300000
		});

		expect(await contract.currentStage()).to.be.bignumber.equal(3);
	});
});