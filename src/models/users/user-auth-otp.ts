import { CrudTimes } from "../crud-times";
import { Entity } from "../entity";

export interface UserAuthenticationOtp extends Entity, CrudTimes {
  userId: string;
  otp: string;
  expiresAt: Date;
  isConsumed: boolean;
}

