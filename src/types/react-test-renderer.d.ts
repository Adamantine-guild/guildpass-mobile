/**
 * Local type declaration for react-test-renderer.
 *
 * react-test-renderer@18.x does not ship bundled TypeScript declarations, and
 * @types/react-test-renderer is not installed in this project.  This file
 * provides the minimal surface needed so TypeScript understands the
 * ReactTestInstance API (findByType, findAllByType, children, ...) used
 * across the test suite.
 *
 * The types mirror @types/react-test-renderer@18 exactly - the real runtime
 * API is unchanged.
 */
declare module "react-test-renderer" {
  import type React from "react";

  export interface ReactTestInstance {
    type: string | React.ComponentType<any>;
    props: { [propName: string]: any };
    parent: ReactTestInstance | null;
    children: (ReactTestInstance | string)[] | null;

    find(predicate: (node: ReactTestInstance) => boolean): ReactTestInstance;
    findByType(type: string | React.ComponentType<any>): ReactTestInstance;
    findByProps(props: { [propName: string]: any }): ReactTestInstance;

    findAll(
      predicate: (node: ReactTestInstance) => boolean,
      options?: { deep: boolean },
    ): ReactTestInstance[];
    findAllByType(
      type: string | React.ComponentType<any>,
      options?: { deep: boolean },
    ): ReactTestInstance[];
    findAllByProps(
      props: { [propName: string]: any },
      options?: { deep: boolean },
    ): ReactTestInstance[];
  }

  export type ReactTestRendererJSON = {
    type: string;
    props: { [propName: string]: any };
    children: ReactTestRendererJSON[] | null;
  };

  export interface ReactTestRenderer {
    toJSON(): ReactTestRendererJSON | ReactTestRendererJSON[] | null;
    toTree(): any;
    update(element: React.ReactElement<any>): void;
    unmount(element?: React.ReactElement<any>): void;
    getInstance(): React.Component<any, any> | null;
    root: ReactTestInstance;
  }

  export interface TestRendererOptions {
    createNodeMock?(element: React.ReactElement<any>): object;
  }

  export function create(
    element: React.ReactElement<any>,
    options?: TestRendererOptions,
  ): ReactTestRenderer;

  export function act(callback: () => Promise<void>): Promise<void>;
  export function act(callback: () => void): void;

  const TestRenderer: {
    create(element: React.ReactElement<any>, options?: TestRendererOptions): ReactTestRenderer;
    act(callback: () => Promise<void>): Promise<void>;
    act(callback: () => void): void;
  };
  export default TestRenderer;
}
