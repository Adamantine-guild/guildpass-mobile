declare module "react-test-renderer" {
  import type { ReactElement } from "react";

  export interface ReactTestInstance {
    props: Record<string, any>;
    findByProps(props: Record<string, unknown>): ReactTestInstance;
  }

  export interface ReactTestRenderer {
    root: ReactTestInstance;
    toJSON(): unknown;
    update(element: ReactElement): void;
    unmount(): void;
  }

  export function act(callback: () => void | Promise<void>): void | Promise<void>;

  const TestRenderer: {
    create(element: ReactElement): ReactTestRenderer;
    act: typeof act;
  };

  export default TestRenderer;
}
