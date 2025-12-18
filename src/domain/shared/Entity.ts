import { randomUUID } from 'crypto';

/**
 * Base class for all Entities in the domain.
 * Entities have identity and can have mutable state.
 */
export abstract class Entity<T> {
  protected readonly _id: string;
  protected props: T;

  protected constructor(props: T, id?: string) {
    this._id = id ?? randomUUID();
    this.props = props;
  }

  /**
   * Returns the unique identifier of the entity.
   */
  public get id(): string {
    return this._id;
  }

  /**
   * Compares two entities for equality based on their identity.
   */
  public equals(other: Entity<T>): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    return this._id === other._id;
  }
}
