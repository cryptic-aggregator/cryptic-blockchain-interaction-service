import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

export function loadProto(protoFileName: string): any {
  // Шлях до основного .proto файлу у каталозі Rpc
  const protoPath = path.resolve(
    __dirname,
    '../../cryptic-domain/Cryptic Domain/Protos/BlockchainInteraction/Rpc',
    protoFileName
  );

  // Вказуємо базову директорію для пошуку імпортованих .proto файлів
  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [
      // Базова директорія, що містить папку BlockchainInteraction
      path.resolve(__dirname, '../../cryptic-domain/Cryptic Domain/Protos'),
    ],
  });

  return grpc.loadPackageDefinition(packageDefinition);
}
