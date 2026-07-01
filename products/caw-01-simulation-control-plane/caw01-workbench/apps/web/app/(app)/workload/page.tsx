import { WorkloadScreen } from "@/features/workload/view/WorkloadScreen";

/**
 * Workload — agent-trace viewer. Client island: traces are loaded in-browser
 * (file input or the bundled example) and parsed via the generic TraceAdapter,
 * so no server read is needed here.
 */
export default function WorkloadPage() {
  return <WorkloadScreen />;
}
