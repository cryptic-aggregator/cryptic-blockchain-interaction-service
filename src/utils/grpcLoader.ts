import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

export function loadProto(protoFileName: string): any {
  const protoPath = path.resolve(
    __dirname,
    '../../cryptic-domain/Cryptic Domain/Protos/BlockchainInteraction/Rpc',
    protoFileName
  );

  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [
      path.resolve(__dirname, '../../cryptic-domain/Cryptic Domain/Protos'),
    ],
  });

  return grpc.loadPackageDefinition(packageDefinition);
}
