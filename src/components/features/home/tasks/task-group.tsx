import { TaskCard } from "./task-card";
import { TaskItemTitle } from "./task-item-title";
import { GitProviderIcon } from "#/components/shared/git-provider-icon";
import { SuggestedTask } from "#/utils/types";

interface TaskGroupProps {
  title: string;
  tasks: SuggestedTask[];
}

export function TaskGroup({ title, tasks }: TaskGroupProps) {
  const gitProvider = tasks.length > 0 ? tasks[0].git_provider : null;

  return (
    <div className="text-content-2 px-[14px]">
      <div className="flex items-center gap-2 border-b-1 border-[#717888] mb-2">
        {gitProvider ? (
          <GitProviderIcon gitProvider={gitProvider} className="text-current" />
        ) : null}
        <TaskItemTitle>{title}</TaskItemTitle>
      </div>

      <ul className="w-full text-sm">
        {tasks.map((task) => (
          <li key={task.issue_number} className="w-full">
            <TaskCard task={task} />
          </li>
        ))}
      </ul>
    </div>
  );
}
