import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import defaultPfp from '../assets/default_pfp.png';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@radix-ui/react-dropdown-menu";
import { DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Button } from "./ui/button";
import { UserContext } from "./UserProvider";
import React from "react";
import { OrgApi } from "@/generated/openapi/apis";
import { type UserOrg } from '@/generated/openapi/models'
import { Link } from "react-router-dom";
import { toast } from "sonner";

export default function Navbar() {
    const { user, setUser } = React.useContext(UserContext);
    const [orgs, setOrgs] = React.useState<UserOrg[] | null>(null);
    React.useEffect(() => {
        (async () => {
            try {
                const orgApi = new OrgApi();
                const orgs = await orgApi.getOrgs();
                setOrgs(orgs);
            } catch (e) {
                if (e instanceof Error) {
                    toast("Nav: " + e.message, {
                        action: {
                            label: 'Close',
                            onClick: () => {},
                        }
                    })
                }
            }
        })();
    }, [user]);

    const handleSelect = async (value: string) => {
        const orgId = parseInt(value);
        const org = orgs?.find(o => o.id === orgId);
        if (!org) {
            toast("Something went wrong", {
                action: {
                    label: 'Close',
                    onClick: () => {}
                }
            });
            return;
        }
        setUser(u => u ? ({
            ...u,
            org
        }) : null);
    };

    return <div className="sticky top-0 left-0 w-full flex justify-end gap-5 pr-5">
        { user ? 
            <>
            <Select defaultValue={user?.org.id.toString()} onValueChange={handleSelect}>
                <SelectTrigger className='p-6'>
                    <SelectValue placeholder='My Organizations'/>
                </SelectTrigger>
                <SelectContent>
                    <SelectGroup>
                        {orgs?.map(
                            org => <SelectItem
                                    value={org.id.toString()}
                                    >{org.name}</SelectItem>)}
                    </SelectGroup>
                </SelectContent>
            </Select>

            <DropdownMenu>
                <DropdownMenuTrigger>
                    <img src={defaultPfp} alt='My Account Options' className='w-12 h-12'/>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuItem>My Organizations</DropdownMenuItem>
                    <DropdownMenuItem>Log Out</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            </>
        : <Link to='/sign-in'><Button>Sign In</Button></Link>
        }
    </div>
}