import { spawnHttpsProxy } from "./proxy";
import { TestPKI, KeyAndCert } from "../Tests/EndToEnd/Helpers/PKI";
import _ from "lodash"
import fs from "fs"

const start = async () => {
    let tlsCerts:{
        server: KeyAndCert;
        caCert: string;
    };
    
    try {
        tlsCerts = {
            caCert: fs.readFileSync('.local-env/ca.pem.cer','ascii'),
            server: {
                key: fs.readFileSync('.local-env/server.pem.key','ascii'),
                certChain: fs.readFileSync('.local-env/server.pem.cer','ascii')
            }
        }
    } catch {
        tlsCerts = await TestPKI.TestConfig()
        fs.writeFileSync('.local-env/ca.pem.cer',tlsCerts.caCert)
        fs.writeFileSync('.local-env/server.pem.key',tlsCerts.server.key)
        fs.writeFileSync('.local-env/server.pem.cer',tlsCerts.server.certChain)
    }

    let tlsConfig = {
        key: Buffer.from(tlsCerts.server.key),
        cert: _.map(_.flatten([tlsCerts.server.certChain]), c => Buffer.from(c)),
        ca: Buffer.from(tlsCerts.caCert),
        requestCert: false
    }

    let mtlsConfig = {
        key: Buffer.from(tlsCerts.server.key),
        cert: _.map(_.flatten([tlsCerts.server.certChain]), c => Buffer.from(c)),
        ca: Buffer.from(tlsCerts.caCert),
        requestCert: true
    }

    spawnHttpsProxy("AdrGatewayPublicProtected", 10101, 8101, tlsConfig, {
        users: { "gateway-user": "gateway-password" },
        noAuthPattern: /(^OPTIONS )|(^PATCH \/cdr\/consents)/ }
    );
    spawnHttpsProxy("AdrGatewayInternal", 9101, 8101, tlsConfig);
    spawnHttpsProxy("AdrServerPublic", 9102, 8102, tlsConfig);
    spawnHttpsProxy("DhServerPublicProtected", 10201, 8201, tlsConfig, {
        users: { "dh-user": "dh-password" },
        noAuthPattern: /^(GET|POST) \//
    });
    spawnHttpsProxy("DhServerMtlsPublicProtected", 10202, 8201, mtlsConfig, {
        users: { "dh-user": "dh-password" },
        noAuthPattern: /^(GET|POST) \//
    });
    spawnHttpsProxy("DhServerInternal", 9201, 8201, tlsConfig);
    spawnHttpsProxy("MockRegister", 9301, 8301, tlsConfig);

}

start()