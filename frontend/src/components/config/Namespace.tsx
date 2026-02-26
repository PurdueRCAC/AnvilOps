import { api } from "@/lib/api";
import type { CommonFormFields } from "@/lib/form.types";
import { useDebouncedValue } from "@/lib/utils";
import { NameStatus } from "@/pages/create-app/CreateAppView";
import { FolderLock, Loader, X } from "lucide-react";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export const Namespace = ({
  state,
  setState,
  setHasChangedNamespace,
  disabled,
}: {
  state: CommonFormFields;
  setState: (update: Partial<CommonFormFields>) => void;
  setHasChangedNamespace: (hasChangedNamespace: boolean) => void;
  disabled?: boolean;
}) => {
  const { namespace } = state;
  const MAX_NAMESPACE_LEN = 63;
  const showNamespaceError =
    !!namespace &&
    (namespace.length > MAX_NAMESPACE_LEN ||
      namespace.match(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/) === null);

  const debouncedNamespace = useDebouncedValue(namespace);
  const enableNamespaceCheck =
    !!namespace && namespace === debouncedNamespace && !showNamespaceError;

  const { data: namespaceStatus, isPending: namespaceLoading } = api.useQuery(
    "get",
    "/app/namespace",
    {
      params: {
        query: {
          namespace: debouncedNamespace ?? "",
        },
      },
    },
    { enabled: enableNamespaceCheck },
  );

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <Label className="pb-1" htmlFor="portNumber">
          <FolderLock className="inline" size={16} /> Namespace
        </Label>
        <span
          className="cursor-default text-red-500"
          title="This field is required."
        >
          *
        </span>
      </div>
      <Input
        disabled={disabled}
        name="namespace"
        id="namespace"
        placeholder="my-app"
        className="w-full"
        required
        value={namespace ?? ""}
        onChange={(e) => {
          setHasChangedNamespace(true);
          setState({ namespace: e.currentTarget.value });
        }}
      />
      {namespace && showNamespaceError && (
        <div className="flex gap-5 text-sm">
          <X className="text-red-500" />
          <ul className="text-black-3 list-disc">
            <li>
              A namespace must have between 1 and {MAX_NAMESPACE_LEN}{" "}
              characters.
            </li>
            <li>
              A namespace must only contain lowercase alphanumeric characters or
              dashes(-).
            </li>
            <li>
              A namespace must start and end with an alphanumeric character.
            </li>
          </ul>
        </div>
      )}
      {namespace &&
        !showNamespaceError &&
        (namespace !== debouncedNamespace || namespaceLoading ? (
          <span className="text-sm">
            <Loader className="inline animate-spin" /> Checking namespace...
          </span>
        ) : (
          <NameStatus
            available={namespaceStatus!.available}
            resourceName="Namespace"
          />
        ))}
    </div>
  );
};
