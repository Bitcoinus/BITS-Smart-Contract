module.exports = {
  // See <http://truffleframework.com/docs/advanced/configuration>
  // to customize your Truffle configuration!
  networks: {
    development: {
      host: "localhost",
      port: 8545,
      network_id: "*", // Match any network id
      gas: 6713094
    },
    live: {
      host: "localhost",  // Change into main net node address
      port: 8545,
      network_id: "1",
      gas: 6713094,
      gasPrice: 21000000000,
      from: "0x7439ae37d5e29633e847c120cA6Db728107f9156",
    }
  }
};
