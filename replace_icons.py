import os
import re

mapping = {
    'Bot': 'Robot',
    'BotMessageSquare': 'Robot',
    'MessageSquare': 'Message',
    'MessageCircle': 'Message',
    'BarChart2': 'ChartBarBig',
    'Link2': 'Link',
    'LogOut': 'Logout',
    'CheckCircle2': 'CheckDouble',
    'XCircle': 'Close',
    'X': 'Close',
    'Trash2': 'Trash',
    'Edit2': 'MagicEdit',
    'Settings': 'Sliders',
    'ShieldCheck': 'Shield',
    'ShieldAlert': 'Shield',
    'UploadCloud': 'Upload',
    'TrendingUp': 'ChartLine',
    'TrendingDown': 'ChartColumnDecreasing',
    'RefreshCw': 'Refresh',
    'UserPlus': 'UserPlus',
    'Users': 'Users',
    'User': 'User',
    'MoreHorizontal': 'MoreHorizontal',
    'MoreVertical': 'MoreVertical',
    'CheckCircle': 'Check',
    'Zap': 'Zap',
    'TriangleAlert': 'Alert',
    'EyeOff': 'EyeOff',
    'Eye': 'Eye',
    'FileUp': 'Upload',
    'ArrowLeft': 'ArrowLeft',
    'FileText': 'FileText',
    'AlertCircle': 'Alert'
}

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

    # Find lucide-react import
    import_match = re.search(r"import\s+\{([^}]+)\}\s+from\s+'lucide-react';", content)
    if import_match:
        icons_str = import_match.group(1)
        icons = [i.strip() for i in icons_str.split(',')]
        new_icons = []
        for icon in icons:
            new_icon = mapping.get(icon, icon)
            new_icons.append(new_icon)
            # Replace tags in content
            content = re.sub(rf"<{icon}(\s|>)", rf"<{new_icon}\1", content)
            content = re.sub(rf"</{icon}>", rf"</{new_icon}>", content)
            # Special case for DashboardLayout array objects, etc.
            content = re.sub(rf"\b{icon}\b", new_icon, content)

        # Ensure unique icons in import
        new_icons = list(dict.fromkeys(new_icons))
        new_import_str = "import { " + ", ".join(new_icons) + " } from 'pixelarticons/react';"
        content = content.replace(import_match.group(0), new_import_str)

        with open(file, 'w') as f:
            f.write(content)
        print(f"Updated {file}")
