import { AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
} from "@/components/ui/accordion";

export default function CreateAppView() {
  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center">
      <div className="w-3/4 lg:w-1/3 min-h-1/2 md:min-h-3/4 bg-neutral-1 rounded-2xl shadow-md shadow-neutral-3 flex justify-center">
        <form
          className="space-y-8 w-3/4 h-full flex flex-col justify-center items-center"
          onSubmit={() => {
            console.log("submit");
          }}
        >
          <h2 className="font-bold text-3xl text-main-5 mb-5">
            Create a Project
          </h2>
          <Select>
            <SelectTrigger className="w-full" onSelect={(e) => e}>
              <SelectValue placeholder="Select an organization" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="org-1">Organization 1</SelectItem>
                <SelectItem value="org-2">Organization 2</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <div className="w-full">
            <Button
              variant="secondary"
              type="button"
              className="cursor-pointer float-right"
            >
              Or create new
            </Button>
            <Select>
              <SelectTrigger className="w-3/4">
                <SelectValue placeholder="Select a repository" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="org-1">Organization 1</SelectItem>
                  <SelectItem value="org-2">Organization 2</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full">
            <label>
              Root directory
              <Input value="./" className="w-full" />
            </label>
            <Accordion type="multiple">
              <AccordionItem value="build">
                <AccordionTrigger>Build settings</AccordionTrigger>
                <AccordionContent>
                  <label>
                    Build command
                    <Input className="w-full" />
                  </label>
                  <label>
                    Output directory
                    <Input className="w-full" />
                  </label>
                  <label>
                    Install command
                    <Input className="w-full" />
                  </label>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="env">
                <AccordionTrigger>Environment variables</AccordionTrigger>
                <AccordionContent>
                  <div className="w-full">
                    <Input placeholder="Key" className="w-1/3 inline-block" />
                    <Input placeholder="Value" className="w-1/3 inline-block" />
                    <Button variant="secondary" type="button">
                      <svg
                        viewBox="0 0 15 15"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-full h-full"
                      >
                        <path
                          d="M8 2.75C8 2.47386 7.77614 2.25 7.5 2.25C7.22386 2.25 7 2.47386 7 2.75V7H2.75C2.47386 7 2.25 7.22386 2.25 7.5C2.25 7.77614 2.47386 8 2.75 8H7V12.25C7 12.5261 7.22386 12.75 7.5 12.75C7.77614 12.75 8 12.5261 8 12.25V8H12.25C12.5261 8 12.75 7.77614 12.75 7.5C12.75 7.22386 12.5261 7 12.25 7H8V2.75Z"
                          fill="currentColor"
                          fill-rule="evenodd"
                          clip-rule="evenodd"
                        ></path>
                      </svg>
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            <Button>Deploy</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
