# bitcoinus
Smart Contracts for bitcoinus.io ICO


## Deployment

1. Before deployment you have to change addresses for:
    - WALLET (line 11)
    - TEAM_WALLET ()
    - BOUNTY_WALLET ()
    - COMPANY_WALLET

2. Recheck ticker. Is ir BIS or BIU?
3. First you have to deploy BitcoinusToken
4. Second you have to deploy BitcoinusCrowdsale and give token smart-contract address into it.
5. Finally you have to execute `transferOwnership` function from BitcoinusToken with address of BitcoinusCrowdsale smart-contract.


P.S. Easies way for deployment is using truffle.

## Tests
Run first
ganache-cli --account="0x7a44e8791fdba705b42b5fd335215757714a3e7c60b9cc867f1318ac601c6f39,1000000000000000000000000000" --account="0x841803f6fb3e68a707e9dc3d592096e7d90531a9d38a8c57fbd166fdf98793d5,1000000000000000000000000000" --account="0xb73d0ec8fa9f45e0a3bc96eb1b95676725afc51ba0ba4f319e7a9a0c549bc365,1000000000000000000000000000"
