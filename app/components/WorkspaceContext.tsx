'use client';

/**
 * WorkspaceContext — provides the active workspace to every module under the
 * (app) route-group layout. The layout selects/validates the workspace once and
 * shares it here, so switching tabs never loses workspace or auth state.
 */

import { createContext, useContext } from 'react';
import { Id } from '@/convex/_generated/dataModel';

export type WorkspaceContextValue = {
  workspaceId: Id<'workspaces'>;
  workspaceName: string;
  /** Clear the current selection and return to the workspace picker. */
  switchWorkspace: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within the (app) layout');
  }
  return ctx;
}

export default WorkspaceContext;
