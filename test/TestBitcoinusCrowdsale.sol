pragma solidity ^0.4.18;

import '../contracts/BitcoinusCrowdsale.sol';

contract TestBitcoinusCrowdsale is BitcoinusCrowdsale {
	uint256 testNow;
	function TestBitcoinusCrowdsale(address _token) BitcoinusCrowdsale(_token) public {
	}

	function setNow(uint256 _now) public {
		testNow = _now;
	}

	function getNow() internal view returns (uint256) {
		return testNow;
	}

	function getNowTest() public view returns (uint256) {
		return getNow();
	}
 
}