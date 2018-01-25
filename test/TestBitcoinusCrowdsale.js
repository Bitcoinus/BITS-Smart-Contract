const BigNumber = require('bignumber.js');

const chai = require('chai');
chai.use(require('chai-as-promised'));
chai.use(require('chai-bignumber')(BigNumber));

const expect = chai.expect;

const OneEther = new BigNumber(web3.toWei(1, 'ether'));
const OneToken = new BigNumber(web3.toWei(1, 'ether'));
const ZeroTokens = new BigNumber(web3.toWei(0, 'ether'));

const BitcoinusCrowdsale = artifacts.require("../contracts/BitcoinusCrowdsale.sol");
const BitcoinusToken = artifacts.require("../contracts/BitcoinusToken.sol");
const RefundVault = artifacts.require("zeppelin-solidity/contracts/crowdsale/RefundVault.sol");

contract('BitcoinusCrowdsale', async (accounts) => {
	let contract;
	let token;
	let vault;
	before(async () => {
		contract = await BitcoinusCrowdsale.deployed();
		token = await BitcoinusToken.at(await contract.token());
		vault = await RefundVault.at(await contract.vault());
	});

	it('should always work', () => {});

	it('set crowdsale contract as BitcoinusToken owner', async () => {
		expect(await token.owner()).to.be.equal(contract.address);
	});

	it('initalizes RefundVault', async () => {
		expect(vault).not.to.be.null;
	});

	it('starts from zero stage', async () => {
		expect(await contract.currentStage()).to.be.bignumber.equal(0);
	});

	it('token minter is owner', async () => {
		await contract.mintTokens([accounts[1]], [OneToken]);
		expect(await token.balanceOf(accounts[1])).to.be.bignumber.equal(OneToken);
	});

	it('fails to manually mint to 0x0 address', async () => {
		await expect(contract.mintTokens([0], [OneToken])).eventually.rejected;
	});

	it('fails to manually mint 0 amount', async () => {
		await expect(contract.mintTokens([accounts[1]], [0])).eventually.rejected;
	});

	it('sets token minter', async () => {
		await contract.setTokenMinter(accounts[1]);
	});

	it('fails to set 0x0 address as token minter', async () => {
		await expect(contract.setTokenMinter(0)).eventually.rejected;
	});

	it('fails to manually mint from other account', async () => {
		await expect(contract.mintTokens([accounts[2]], [OneToken], {
			from: accounts[2]
		})).eventually.rejected;
	});

	it('token minter can manually mint', async () => {
		await contract.mintTokens([accounts[2]], [OneToken], {
			from: accounts[1]
		});

		expect(await token.balanceOf(accounts[2])).to.be.bignumber.equal(OneToken);
	});

	it('owner can manually mint', async () => {
		await contract.mintTokens([accounts[2]], [OneToken], {
			from: accounts[0]
		});

		expect(await token.balanceOf(accounts[2])).to.be.bignumber.equal(OneToken.mul(2));
	});

	it('fails to transfer tokens before ICO end', async () => {
		await expect(token.transfer(accounts[1], OneToken, {from : accounts[2]})).eventually.rejected;
	});

	it('mints to many addresses', async () => {
		await contract.mintTokens([accounts[1], accounts[2]], [OneToken, OneToken], {
			from: accounts[1]
		});

		expect(await token.balanceOf(accounts[1])).to.be.bignumber.equal(OneToken.mul(2));
		expect(await token.balanceOf(accounts[2])).to.be.bignumber.equal(OneToken.mul(3));
	});

	it('fails to mint to many addresses when array size unequal 1', async () => {
		await expect(contract.mintTokens([accounts[1]], [OneToken, OneToken], {
			from: accounts[1]
		})).eventually.rejected;
	});

	it('fails to mint to many addresses when array size unequal 2', async () => {
		await expect(contract.mintTokens([accounts[1], accounts[2]], [OneToken], {
			from: accounts[1]
		})).eventually.rejected;
	});

	it('fails to mint to many addresses when array is empty', async () => {
		await expect(contract.mintTokens([], [], {
			from: accounts[1]
		})).eventually.rejected;
	});

	it('fails to mint to many addresses when array have > 100 elements', async () => {
		let receivers = [];
		let amounts = [];
		for (let i = 0; i < 101; i++) {
			receivers.push(accounts[0]);
			amounts.push(OneToken);
		}
		await expect(contract.mintTokens(receivers, amounts, {
			from: accounts[1]
		})).eventually.rejected;
	});

	it('manually mints all left tokens', async () => {
		const tx = await contract.mintTokens([accounts[1]], [web3.toWei(10000000000, 'ether')]);

		expect(await token.totalSupply()).to.be.bignumber.equal(await contract.ICO_TOKENS());

		expect(tx.logs[0].event).to.be.equal('ManualTokenMintRequiresRefund');
	});



});