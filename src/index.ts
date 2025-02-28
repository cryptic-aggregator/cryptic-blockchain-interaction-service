import * as grpc from '@grpc/grpc-js';
import { loadProto } from './utils/grpcLoader';
import { walletService } from './services/walletService';

// Load the package based on your proto file
const proto = loadProto('BlockchainIneractionService.proto').cryptic.blockchain_interaction.rpc;
const server = new grpc.Server();

server.addService(proto.WalletService.service, walletService);

function main(): void {
  const bindAddress = '0.0.0.0:4001';
  server.bindAsync(bindAddress, grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) {
      console.error(`Error binding server: ${err.message}`);
      return;
    }
    console.log(`gRPC server is running at ${bindAddress}`);
    server.start();
  });
}

main();
