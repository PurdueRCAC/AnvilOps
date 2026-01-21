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
  SiCplusplus,
  SiDeno,
  SiDjango,
  SiDotnet,
  SiElixir,
  SiFastapi,
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
              <AppWindow size={32} /> Your app is automatically deployed in the{" "}
              {settings.clusterName} cluster
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
          <a rel="nofollow" href="https://nodejs.org/">
            <FaNodeJs size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a rel="nofollow" href="https://nextjs.org/">
            <RiNextjsLine
              size={56}
              className="text-black-4 hover:text-gold-4"
            />
          </a>
          <a rel="nofollow" href="https://remix.run/">
            <RiRemixRunLine
              size={56}
              className="text-black-4 hover:text-gold-4"
            />
          </a>
          <a rel="nofollow" href="https://vite.dev/">
            <SiVite size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a rel="nofollow" href="https://astro.build/">
            <SiAstro size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a rel="nofollow" href="https://nuxt.com/">
            <SiNuxtdotjs size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a rel="nofollow" href="https://python.org/">
            <FaPython size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a rel="nofollow" href="https://djangoproject.com/">
            <SiDjango size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a rel="nofollow" href="https://fastapi.tiangolo.com/">
            <SiFastapi size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a rel="nofollow" href="https://go.dev/">
            <BiLogoGoLang
              size={56}
              className="text-black-4 hover:text-gold-4"
            />
          </a>
          <a rel="nofollow" href="https://php.net/">
            <FaPhp size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a rel="nofollow" href="https://laravel.com/">
            <FaLaravel size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a
            rel="nofollow"
            href="https://developer.mozilla.org/en-US/docs/Web/HTML"
          >
            <FaHtml5 size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a rel="nofollow" href="https://java.com/">
            <FaJava size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a rel="nofollow" href="https://ruby-lang.org/en/">
            <SiRuby size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a rel="nofollow" href="https://rubyonrails.org/">
            <SiRubyonrails
              size={56}
              className="text-black-4 hover:text-gold-4"
            />
          </a>
          <a rel="nofollow" href="https://deno.com/">
            <SiDeno size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a rel="nofollow" href="https://rust-lang.org/">
            <FaRust size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a rel="nofollow" href="https://elixir-lang.org/">
            <SiElixir size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <a rel="nofollow" href="https://gleam.run/">
            <svg
              width={56}
              height={56}
              className="text-black-4 hover:text-gold-4"
              fill="currentColor"
              role="img"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <title>Gleam</title>
              <path d="M10.6144.0026a1.9 1.9 0 0 0-.229.0261l.0001.0002C9.78.1358 9.2263.538 8.9971 1.1873l-1.7855 5.059A1.8 1.8 0 0 1 6.1704 7.323L1.1706 9.282c-1.283.5027-1.531 2.2673-.4373 3.1027l4.2646 3.257a1.795 1.795 0 0 1 .7031 1.3212l.3179 5.3537c.0815 1.3735 1.6836 2.1548 2.819 1.3729v-.0002l4.4212-3.0459v-.0001a1.8 1.8 0 0 1 1.4757-.2601l5.1962 1.3498c1.3342.3467 2.5725-.9356 2.1794-2.2543v.0002l-1.532-5.1397a1.796 1.796 0 0 1 .209-1.482v-.0002l2.8934-4.5194c.742-1.1591-.0945-2.7324-1.472-2.766l-5.368-.1303a1.8 1.8 0 0 1-1.3467-.6558L12.0862.6422c-.3827-.4654-.9342-.6678-1.4718-.6396m5.7066 10.4086c.4626-.0106.8762.3176.959.7872a.953.953 0 0 1-.773 1.1038.9528.9528 0 1 1-.186-1.891M8.6439 11.765a.953.953 0 0 1 .959.7873c.0913.5182-.2548 1.0123-.773 1.1038s-1.0125-.2547-1.1038-.7729c-.0914-.5182.2547-1.0124.773-1.1038a.96.96 0 0 1 .1448-.0144m4.928 1.3841a.486.486 0 0 1 .3397.15.485.485 0 0 1 .1339.3463 1.264 1.264 0 0 1-.3917.8853v.0001h-.0002a1.266 1.266 0 0 1-.9026.3488h-.0004a1.26 1.26 0 0 1-.4812-.1079 1.26 1.26 0 0 1-.4038-.284 1.27 1.27 0 0 1-.2642-.4168.485.485 0 0 1 .278-.6272.483.483 0 0 1 .371.009.485.485 0 0 1 .2561.2687.29.29 0 0 0 .0615.097v.0002a.3.3 0 0 0 .0938.0658v.0001h.0003a.295.295 0 0 0 .2252.0055l.0003-.0001a.292.292 0 0 0 .1628-.1553l.0002-.0002v-.0001a.29.29 0 0 0 .025-.1116.486.486 0 0 1 .15-.3395.485.485 0 0 1 .3463-.134z" />
            </svg>
          </a>
          <a rel="nofollow" href="https://dotnet.microsoft.com/">
            <SiDotnet size={56} className="text-black-4 hover:text-gold-4" />
          </a>
          <p>
            <SiCplusplus size={56} className="text-black-4 hover:text-gold-4" />
          </p>
        </div>
        <h1 className="text-4xl font-bold mb-4 mt-16">FAQs</h1>
        <Accordion type="single" collapsible>
          {settings.faq?.question && settings.faq?.answer && (
            <AccordionItem value="q1">
              <AccordionTrigger className="font-bold text-lg">
                {settings.faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-pretty p-4 text-base">
                {settings.faq.answer}
                {settings.faq?.link && (
                  <p>
                    Visit{" "}
                    <a
                      rel="nofollow"
                      href={settings.faq.link}
                      className="underline"
                    >
                      {settings.faq.link}
                    </a>{" "}
                    for more information.
                  </p>
                )}
              </AccordionContent>
            </AccordionItem>
          )}

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
              Astro, Nuxt, and Angular), Python (including Django and FastAPI),
              Go, PHP (including Laravel), HTML, Java (including Spring Boot),
              Ruby, Deno, Rust, Elixir, Gleam, .NET, C/C++, and shell scripts.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
      <div className="h-10 w-full bg-black text-white text-sm text-center flex justify-center items-center">
        {settings?.version ? <>AnvilOps {settings.version} &middot; </> : null}
        Made with 💛 by the AnvilOps Team
      </div>
    </>
  );
}
