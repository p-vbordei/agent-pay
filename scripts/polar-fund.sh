#!/usr/bin/env bash
set -euo pipefail
COMPOSE="docker compose -f docker-compose.polar.yml"
ADDR_ALICE=$($COMPOSE exec -T alice lncli --network=regtest newaddress p2wkh | jq -r .address)
$COMPOSE exec -T bitcoind bitcoin-cli -regtest -rpcuser=polar -rpcpassword=polar generatetoaddress 101 "$ADDR_ALICE" >/dev/null
PUB_BOB=$($COMPOSE exec -T bob lncli --network=regtest getinfo | jq -r .identity_pubkey)
$COMPOSE exec -T alice lncli --network=regtest connect "$PUB_BOB@bob:9735" >/dev/null || true
$COMPOSE exec -T alice lncli --network=regtest openchannel --node_key="$PUB_BOB" --local_amt=1000000 --push_amt=500000 >/dev/null
$COMPOSE exec -T bitcoind bitcoin-cli -regtest -rpcuser=polar -rpcpassword=polar generatetoaddress 6 "$ADDR_ALICE" >/dev/null
echo "Channel opened. Macaroons (admin):"
echo "  alice: $($COMPOSE exec -T alice xxd -p -c 99999 /root/.lnd/data/chain/bitcoin/regtest/admin.macaroon | tr -d '\n')"
echo "  bob:   $($COMPOSE exec -T bob   xxd -p -c 99999 /root/.lnd/data/chain/bitcoin/regtest/admin.macaroon | tr -d '\n')"
