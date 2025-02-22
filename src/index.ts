import * as grpc from '@grpc/grpc-js';
import { loadProto } from './utils/grpcLoader';
import { walletService } from './services/walletService';

// Отримуємо пакет з іменем, яке відповідає вашому .proto файлу
const proto = loadProto('BlockchainIneractionService.proto').cryptic.blockchain_interaction.rpc;
const server = new grpc.Server();

server.addService(proto.WalletService.service, walletService);

function main(): void {
  const bindAddress = '0.0.0.0:50051';
  server.bindAsync(bindAddress, grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) {
      console.error(`Помилка прив'язки сервера: ${err.message}`);
      return;
    }
    console.log(`gRPC сервер запущено за адресою ${bindAddress}`);
    server.start();
  });
}

main();
