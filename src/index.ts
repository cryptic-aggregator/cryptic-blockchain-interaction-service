import * as grpc from '@grpc/grpc-js';
import { loadProto } from './utils/grpcLoader';
import { walletService } from './services/walletService';

// Завантаження пакету з вашого .proto файлу
const proto = loadProto('BlockchainIneractionService.proto').cryptic.blockchain_interaction.rpc;
const server = new grpc.Server();

// Додаємо сервіс
server.addService(proto.WalletService.service, walletService);

function main(): void {
  // Масив адрес, на яких сервер буде слухати запити
  const addresses = ['0.0.0.0:4000', '0.0.0.0:4001'];
  let boundCount = 0;

  addresses.forEach((bindAddress) => {
    server.bindAsync(bindAddress, grpc.ServerCredentials.createInsecure(), (err, port) => {
      if (err) {
        console.error(`Error binding server to ${bindAddress}: ${err.message}`);
        return;
      }
      console.log(`gRPC server bound to ${bindAddress} on port ${port}`);
      boundCount++;
      // Коли сервер прив'язався до всіх адрес, запускаємо його
      if (boundCount === addresses.length) {
        server.start();
        console.log(`gRPC server is running on: ${addresses.join(', ')}`);
      }
    });
  });
}

main();
