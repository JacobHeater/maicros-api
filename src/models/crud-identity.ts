import { Entity } from "./entity";

export interface CrudIdentity {
    createdBy: Entity;
    updatedBy?: Entity;
}