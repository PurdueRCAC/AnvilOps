import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import defaultPfp from '../assets/default_pfp.png';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@radix-ui/react-dropdown-menu";
import { DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Button } from "./ui/button";
export default function Navbar() {
    return <div className="w-full flex justify-end gap-5 pr-5">
        <Select defaultValue='org-1'>
            <SelectTrigger className='p-6'>
                <SelectValue/>
            </SelectTrigger>
            <SelectContent>
                <SelectGroup>
                    <SelectItem value='org-1'>Organization 1</SelectItem>
                    <SelectItem value='org-2'>Organization 2</SelectItem>
                </SelectGroup>
            </SelectContent>
        </Select>

        <DropdownMenu>
            <DropdownMenuTrigger>
                <img src={defaultPfp} alt='My Account Options' className='w-12 h-12'/>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                <DropdownMenuItem asChild><Button variant='secondary' className='cursor-pointer'>Log Out</Button></DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
        
    </div>
}