import { IsEmail } from 'class-validator';

export class AuthenticationDto {
  @IsEmail()
  email: string;
}
