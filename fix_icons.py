import os
import re

files = [
    'src/pages/Automations/Automations.jsx',
    'src/layouts/DashboardLayout.jsx',
    'src/pages/Connections/Connections.jsx',
    'src/pages/Settings/Settings.jsx',
    'src/pages/Agents/Agents.jsx',
    'src/pages/Contacts/Contacts.jsx',
    'src/pages/Dashboard/Dashboard.jsx',
    'src/pages/MassMessage/MassMessage.jsx',
    'src/pages/Chat/Chat.jsx',
    'src/pages/Login/Login.jsx'
]

for file in files:
    with open(file, 'r') as f:
        content = f.read()

    # Replace any remaining lucide-react with pixelarticons/react
    content = content.replace("'lucide-react'", "'pixelarticons/react'")

    # Find the pixelarticons/react import block
    import_match = re.search(r"import\s+\{([^}]+)\}\s+from\s+'pixelarticons/react';", content, re.MULTILINE | re.DOTALL)
    if import_match:
        icons_str = import_match.group(1)
        icons = [i.strip() for i in icons_str.split(',') if i.strip()]
        # Remove duplicates while preserving order
        unique_icons = list(dict.fromkeys(icons))
        
        # Replace the import block
        new_import_str = "import {\n  " + ",\n  ".join(unique_icons) + "\n} from 'pixelarticons/react';"
        content = content.replace(import_match.group(0), new_import_str)

        with open(file, 'w') as f:
            f.write(content)
        print(f"Fixed {file}")
