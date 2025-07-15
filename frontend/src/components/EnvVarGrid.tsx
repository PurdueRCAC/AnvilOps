import { Trash2 } from "lucide-react";
import { Fragment, useEffect, useState, type Dispatch } from "react";
import HelpTooltip from "./HelpTooltip";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";

type EnvVars = { name: string; value: string | null; isSensitive: boolean }[];

// TODO: show error message on duplicate env names
export const EnvVarGrid = ({
  value: envVars,
  setValue: setEnvironmentVariables,
  fixedSensitiveNames,
}: {
  value: EnvVars;
  setValue: Dispatch<React.SetStateAction<EnvVars>>;
  fixedSensitiveNames: Set<string>;
}) => {
  const [error, setError] = useState("");
  useEffect(() => {
    for (let i in envVars) {
      if (
        envVars[i].name === "" &&
        envVars[i].value === "" &&
        !envVars[i].isSensitive &&
        +i < envVars.length - 1
      ) {
        setEnvironmentVariables((prev) => prev.toSpliced(+i, 1));
        return;
      }
    }
    if (
      envVars[envVars.length - 1]?.name !== "" ||
      envVars[envVars.length - 1]?.value !== "" ||
      envVars[envVars.length - 1]?.isSensitive
    ) {
      setEnvironmentVariables((prev) => [
        ...prev,
        { name: "", value: "", isSensitive: false },
      ]);
    }
  }, [envVars]);

  return (
    <div className="grid grid-cols-[1fr_min-content_1fr_min-content_min-content] items-center gap-2">
      <span className="text-sm col-span-2">Name</span>
      <span className="text-sm col-span-1">Value</span>
      <span className="text-sm col-span-1 flex items-center justify-start gap-1">
        Sensitive
        <HelpTooltip size={15}>
          <p>The values of sensitive environment variables cannot be viewed</p>
          <p>in the app settings, and their names cannot be changed later.</p>
        </HelpTooltip>
      </span>
      <span></span>
      {envVars.map(({ name, value, isSensitive }, index) => {
        const isFixedSensitive = fixedSensitiveNames.has(name);
        return (
          <Fragment key={index}>
            <Input
              placeholder="NODE_ENV"
              required={index !== envVars.length - 1}
              className="w-full"
              disabled={isFixedSensitive}
              disabledTooltip={
                <p>
                  The name of a sensitive environment variable cannot be
                  changed.
                </p>
              }
              value={name}
              onChange={(e) => {
                const newList = structuredClone(envVars);
                newList[index].name = e.currentTarget.value;
                console.log(newList);
                const duplicates = getDuplicates(newList);
                console.log("duplicates: " + duplicates);
                if (duplicates.length != 0) {
                  setError(
                    `Duplicate environment variable(s): ${duplicates.join(", ")}`,
                  );
                } else {
                  setError("");
                }
                setEnvironmentVariables(newList);
              }}
            />
            <span className="text-xl align-middle w-fit">=</span>
            <label>
              <Input
                placeholder={isFixedSensitive ? "Hidden value" : "production"}
                className="w-full"
                value={value ?? ""}
                onChange={(e) => {
                  const newList = structuredClone(envVars);
                  newList[index].value = e.currentTarget.value;
                  setEnvironmentVariables(newList);
                }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
              />
            </label>
            <div className="text-center">
              <Checkbox
                className="size-6"
                disabled={isFixedSensitive}
                checked={isSensitive}
                onCheckedChange={(checked) => {
                  const newList = structuredClone(envVars);
                  newList[index].isSensitive =
                    checked === "indeterminate" ? false : checked;
                  setEnvironmentVariables(newList);
                }}
              />
            </div>
            <Button
              variant="secondary"
              type="button"
              onClick={() => {
                setEnvironmentVariables(envVars.filter((_, i) => i !== index));
              }}
            >
              <Trash2 />
            </Button>
          </Fragment>
        );
      })}
      <p className="text-sm text-red-500 col-span-4">{error}</p>
    </div>
  );
};

const getDuplicates = (values: EnvVars): string[] => {
  const names = new Set();
  const result = [];
  for (let env of values) {
    if (env.name === "") {
      continue;
    }
    if (names.has(env.name)) {
      result.push(env.name);
    }
    names.add(env.name);
  }
  return result;
};
