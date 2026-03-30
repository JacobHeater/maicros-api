import { CrudTimes } from "../crud-times";
import { Entity } from "../entity";

export interface User extends Entity, CrudTimes {
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: Date;
  verified: boolean;
  isActive: boolean;
  locked: boolean;
}
