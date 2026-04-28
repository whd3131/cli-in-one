import * as React from 'react';

export function resolveBaseUiRenderProp(asChild, children) {
  if (!asChild) {
    return {
      children,
      render: undefined
    };
  }

  return {
    children: undefined,
    render: React.Children.only(children)
  };
}
