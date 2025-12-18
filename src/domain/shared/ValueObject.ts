/**
 * Base class for all Value Objects in the domain.
 * Value Objects are immutable and compared by their properties, not by identity.
 */
export abstract class ValueObject<T> {
  protected readonly props: T;

  protected constructor(props: T) {
    this.props = Object.freeze(props);
  }

  /**
   * Compares two value objects for equality based on their properties.
   */
  public equals(other: ValueObject<T>): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }

  /**
   * Returns the raw properties of the value object.
   */
  public toValue(): T {
    return this.props;
  }
}
