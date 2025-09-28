import { useAppConfig } from "@/components/AppConfigProvider";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  AppWindow,
  Container,
  GitCommit,
  GitPullRequestArrow,
  Hammer,
  History,
  LayoutDashboard,
  LifeBuoy,
  TrendingUp,
  Undo2,
} from "lucide-react";
import { BiLogoGoLang } from "react-icons/bi";
import {
  FaHtml5,
  FaJava,
  FaLaravel,
  FaNodeJs,
  FaPhp,
  FaPython,
  FaRust,
} from "react-icons/fa";
import { RiNextjsLine, RiRemixRunLine } from "react-icons/ri";
import {
  SiAstro,
  SiDeno,
  SiDjango,
  SiElixir,
  SiNuxtdotjs,
  SiRuby,
  SiRubyonrails,
  SiVite,
} from "react-icons/si";
import { Link } from "react-router-dom";
import { GitHubIcon } from "./create-app/CreateAppView";

export default function LandingView() {
  const settings = useAppConfig();

  return (
    <>
      <div className="mx-auto max-w-4xl my-10">
        <h1 className="text-4xl font-bold mb-4 mt-16">
          Deploy your app in{" "}
          <span className="underline decoration-[4px] decoration-gold">
            seconds
          </span>
          .
        </h1>
        <p>
          AnvilOps lets you deploy your app to{" "}
          {settings.clusterName ?? "a Kubernetes cluster"} without writing
          Kubernetes manifests.
        </p>
        <Link to="/create-app" className="inline-block mt-8">
          <Button>Deploy Now</Button>
        </Link>

        <h2 className="text-4xl font-bold mb-4 mt-16 flex gap-2">
          <GitPullRequestArrow size={38} />
          Seamless Git Integration
        </h2>
        <p className="mb-8">
          AnvilOps continuously keeps your deployment in sync with your Git
          repository. <br />
          Here's how it works:
        </p>
        <div className="relative flex flex-col gap-12">
          <div className="absolute start-[calc(1rem-1px)] bg-gold -z-50 inset-y-0 w-0.5 my-6" />
          <div className="flex gap-4 items-center">
            <div className="size-8 rounded-full bg-gold flex items-center justify-center">
              1
            </div>
            <p>
              <GitCommit size={32} /> You push a commit to your Git repository
            </p>
          </div>
          <div className="flex gap-4 items-center">
            <div className="size-8 rounded-full bg-gold flex items-center justify-center">
              2
            </div>
            <p>
              <Hammer size={32} /> AnvilOps builds a container image from your
              code
            </p>
          </div>
          <div className="flex gap-4 items-center">
            <div className="size-8 rounded-full bg-gold flex items-center justify-center">
              3
            </div>
            <p>
              <AppWindow size={32} /> Your app is automatically deployed in the
              Anvil Composable cluster
            </p>
          </div>
        </div>

        <h2 className="text-4xl font-bold mb-4 mt-16 flex gap-2">
          <LifeBuoy size={38} />
          Kubernetes is hard. Let us handle it for you.
        </h2>
        <div className="grid grid-cols-2 max-w-4xl gap-4">
          <div className="rounded-md bg-stone-50 border border-input p-4">
            <h3 className="text-lg font-bold">Without AnvilOps</h3>
            <ol className="list-decimal pl-4 space-y-1 mt-2">
              <li>Install Docker and kubectl</li>
              <li>Create a Dockerfile</li>
              <li>Build and tag the Docker image</li>
              <li>Set up a container registry and log in</li>
              <li>Push the image to the registry</li>
              <li>Create Deployment, Service, and Ingress configurations</li>
              <li>Apply configurations to your cluster</li>
            </ol>
          </div>
          <div className="rounded-md bg-stone-50 border border-input p-4">
            <h3 className="text-lg font-bold">With AnvilOps</h3>
            <ol className="list-decimal pl-4 space-y-1 mt-2">
              <li>Sign in to AnvilOps</li>
              <li>Connect your GitHub organization</li>
              <li>Fill in a few details about your app</li>
              <li>That's it! 🥳</li>
            </ol>
          </div>
        </div>

        <h2 className="text-4xl font-bold flex gap-2 mb-4 mt-16">
          <History size={38} />
          Monitor and roll back your deployments
        </h2>
        <p>
          Each push to the selected branch creates a new deployment on the
          cluster.
        </p>
        <div className="space-y-2 mt-2">
          <p className="flex gap-1">
            <LayoutDashboard />
            <span className="font-bold">Rapid status updates.</span> View log
            streams and monitor the health of your deployment in real time.
          </p>
          <p className="flex gap-1">
            <Undo2 />
            <span className="font-bold">Made a bad commit?</span> Roll back to a
            previous deployment at any time.
          </p>
          <p className="flex gap-1">
            <TrendingUp />
            <span className="font-bold">Ready to grow?</span> Update your app
            configuration with replicas, autoscaling, storage, and more.
          </p>
        </div>
        <h1 className="text-4xl font-bold flex gap-2 mb-4 mt-16">
          <GitHubIcon className="w-8 inline" /> Bring your repository as-is
        </h1>
        <p className="flex gap-1">
          <Container size={24} /> Railpack analyzes your repository to build a
          container image— no need for a Dockerfile!
        </p>
        <p className="font-bold text-black-3">
          Supported languages and frameworks:
        </p>
        <div className="py-3 flex gap-5 flex-wrap">
          <a href="https://nodejs.org/">
            <FaNodeJs size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a href="https://nextjs.org/">
            <RiNextjsLine
              size={56}
              className="text-black-4 hover:text-gold-4"
            />
          </a>
          <a href="https://remix.run/">
            <RiRemixRunLine
              size={56}
              className="text-black-4 hover:text-gold-4"
            />
          </a>
          <a href="https://vite.dev/">
            <SiVite size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a href="https://astro.build/">
            <SiAstro size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a href="https://nuxt.com/">
            <SiNuxtdotjs size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a href="https://python.org/">
            <FaPython size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a href="https://djangoproject.com/">
            <SiDjango size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a href="https://go.dev/">
            <BiLogoGoLang
              size={56}
              className="text-black-4 hover:text-gold-4"
            />
          </a>
          <a href="https://php.net/">
            <FaPhp size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a href="https://laravel.com/">
            <FaLaravel size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a href="https://developer.mozilla.org/en-US/docs/Web/HTML">
            <FaHtml5 size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a href="https://java.com/">
            <FaJava size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a href="https://ruby-lang.org/en/">
            <SiRuby size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a href="https://rubyonrails.org/">
            <SiRubyonrails
              size={56}
              className="text-black-4 hover:text-gold-4"
            />
          </a>
          <a href="https://deno.com/">
            <SiDeno size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a href="https://rust-lang.org/">
            <FaRust size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a href="https://elixir-lang.org/">
            <SiElixir size={56} className="text-black-4 hover:text-gold-4" />
          </a>
        </div>
        <h1 className="text-4xl font-bold mb-4 mt-16">FAQs</h1>
        <Accordion type="single" collapsible>
          <AccordionItem value="q1">
            <AccordionTrigger className="font-bold text-lg">
              What is the Anvil Composable Subsystem?
            </AccordionTrigger>
            <AccordionContent className="text-pretty p-4 text-base">
              Anvil Composable Subsystem is a Kubernetes based private cloud
              managed with Rancher that provides a platform for creating
              composable infrastructure on demand. This cloud-style flexibility
              provides researchers the ability to self-deploy and manage
              persistent services to complement HPC workflows and run
              container-based data analysis tools and applications.
              <p>
                Visit{" "}
                <a className="underline">
                  https://www.rcac.purdue.edu/knowledge/anvil/composable
                </a>{" "}
                for more information.
              </p>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q2">
            <AccordionTrigger className="font-bold text-lg">
              What languages and frameworks are supported?
            </AccordionTrigger>
            <AccordionContent className="text-pretty p-4 text-base">
              Any application with a Dockerfile is supported. We also support
              zero-configuration deployments from every language and framework
              that{" "}
              <a className="font-medium underline" href="https://railpack.com/">
                Railpack
              </a>{" "}
              supports, including Node.js (including Next.js, Remix, Vite,
              Astro, Nuxt, and Angular), Python (including Django), Go, PHP
              (including Laravel), HTML, Java (including Spring Boot), Ruby,
              Deno, Rust, Elixir, and shell scripts.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
      <div className="h-10 w-full bg-black text-white text-sm text-center flex justify-center items-center">
        Made with 💛 by the AnvilOps Team
      </div>
    </>
  );
}
