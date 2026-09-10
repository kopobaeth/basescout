import { lazy, Suspense } from "react";
import type { StructureFlowBackgroundProps } from "./StructureFlowBackground";

// Only the requested variant is included in the supplied source bundle.
// The unmodified 13-variant entry point is retained under vendor/ for provenance.
export type StructureFlowCollectionProps = StructureFlowBackgroundProps & { variant?: "structure-flow" };
const StructureVariant = lazy(() => import("./StructureFlowBackground").then(module => ({ default: module.StructureFlowBackground })));

export function StructureFlowCollection({ variant: _variant, ...props }: StructureFlowCollectionProps) {
  return <Suspense fallback={null}><StructureVariant {...props} /></Suspense>;
}
