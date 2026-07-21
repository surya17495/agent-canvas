import { Navigate } from "react-router";

/**
 * The Memory screen moved out of Settings to the standalone `/memory` page
 * (graph + editable blocks). This route stays as a redirect so old deep links
 * and bookmarks keep working.
 */
export default function CentriMemoryRoute() {
  return <Navigate to="/memory" replace />;
}
