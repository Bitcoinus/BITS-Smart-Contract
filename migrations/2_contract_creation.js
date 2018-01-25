var BitcoinusCrowdsale = artifacts.require("./BitcoinusCrowdsale.sol");
var BitcoinusToken = artifacts.require("./BitcoinusToken.sol");

module.exports = function(deployer, network, addresses) {
	deployer.deploy(BitcoinusToken).then(() => {
		return deployer.deploy(BitcoinusCrowdsale, BitcoinusToken.address);
	}).then(() => {
		return BitcoinusToken.deployed();
	}).then((token) => {
		return token.transferOwnership(BitcoinusCrowdsale.address);
	});
};