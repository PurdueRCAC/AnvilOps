import HelpTooltip from "@/components/HelpTooltip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { Fragment, useEffect, useState } from "react";

type EnvVars = { name: string; value: string | null; isSensitive: boolean }[];

export const EnvsWithDiffs = ({
  base,
  value: envVars,
  setValue: setEnvironmentVariables,
  fixedSensitiveNames,
  disabled = false,
}: {
  base: EnvVars;
  value: EnvVars;
  setValue: (updater: (envVars: EnvVars) => EnvVars) => void;
  fixedSensitiveNames: Set<string>;
  disabled?: boolean;
}) => {
  const [error, setError] = useState("");
  useEffect(() => {
    for (const i in envVars) {
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

  const currentEnv = envVars.reduce(
    (obj, current) => {
      obj[current.name] = {
        value: current.value,
        isSensitive: current.isSensitive,
      };
      return obj;
    },
    {} as Record<string, { value: string | null; isSensitive: boolean }>,
  );

  const changedBaseVars = base.filter(
    (envVar) =>
      !(envVar.name in currentEnv) ||
      envVar.value !== currentEnv[envVar.name].value,
  );

  return (
    <div className="grid grid-cols-[1fr_min-content_1fr_min-content_min-content] items-center gap-2">
      <span className="col-span-2 text-sm">Name</span>
      <span className="col-span-1 text-sm">Value</span>
      <span className="col-span-1 flex items-center justify-start gap-1 text-sm">
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
              disabled={disabled || isFixedSensitive}
              disabledTooltip={
                !disabled && (
                  <p>
                    The name of a sensitive environment variable cannot be
                    changed.
                  </p>
                )
              }
              value={name}
              onChange={(e) => {
                const value = e.currentTarget.value;
                setEnvironmentVariables((prev) => {
                  const newList = prev.toSpliced(index, 1, {
                    ...prev[index],
                    name: value,
                  });
                  const duplicates = getDuplicates(newList);
                  if (duplicates.length != 0) {
                    setError(
                      `Duplicate environment variable(s): ${duplicates.join(", ")}`,
                    );
                  } else {
                    setError("");
                  }
                  return newList;
                });
              }}
            />
            <span className="w-fit align-middle text-xl">=</span>
            <label>
              <Input
                disabled={disabled}
                placeholder={isFixedSensitive ? "Hidden value" : "production"}
                className="w-full"
                value={value ?? ""}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setEnvironmentVariables((prev) => {
                    const newList = prev.toSpliced(index, 1, {
                      ...prev[index],
                      value: value,
                    });
                    return newList;
                  });
                }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
              />
            </label>
            <div className="text-center">
              <Checkbox
                className="size-6"
                disabled={disabled || isFixedSensitive}
                checked={isSensitive}
                onCheckedChange={(checked) => {
                  setEnvironmentVariables((prev) => {
                    const newList = prev.toSpliced(index, 1, {
                      ...prev[index],
                      isSensitive:
                        checked === "indeterminate" ? false : checked,
                    });
                    return newList;
                  });
                }}
              />
            </div>
            <Button
              disabled={disabled}
              variant="secondary"
              type="button"
              onClick={() => {
                setEnvironmentVariables((prev) =>
                  prev.filter((_, i) => i !== index),
                );
              }}
            >
              <Trash2 />
            </Button>
          </Fragment>
        );
      })}
      <p className="col-span-5 text-sm text-red-500">{error}</p>
      {changedBaseVars.length > 0 && (
        <>
          <p className="text-black-4 col-span-full my-2 text-base">
            These variables will be removed:
          </p>
          <span className="text-black-4 col-span-2 text-sm">Name</span>
          <span className="text-black-4 col-span-1 text-sm">Value</span>
          <span className="text-black-4 col-span-1 text-sm">Sensitive</span>
          <span></span>
          {changedBaseVars.map(({ name, value, isSensitive }, index) => (
            <Fragment key={`base-${index}`}>
              <Input
                disabled
                value={name}
                className="w-full bg-red-200 italic"
              />
              <span className="w-fit align-middle text-xl">=</span>
              <Input
                disabled
                value={value ?? "Hidden value"}
                className="w-full bg-red-200 italic"
              />
              <div className="text-center">
                <Checkbox className="size-6" disabled checked={isSensitive} />
              </div>
              <span></span>
            </Fragment>
          ))}
        </>
      )}
    </div>
  );
};

const getDuplicates = (values: EnvVars): string[] => {
  const names = new Set();
  const result = [];
  for (const env of values) {
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
