import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import type { Configuracion } from "../config/configuracion";

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Configuracion, true>) => ({
        secret: config.get("JWT_SECRET", { infer: true }),
        signOptions: {
          expiresIn: config.get("JWT_EXPIRES_IN", { infer: true }),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
