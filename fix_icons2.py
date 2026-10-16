import os
import re

files = [
    'src/layouts/DashboardLayout.jsx',
    'src/pages/Connections/Connections.jsx',
    'src/pages/Agents/Agents.jsx',
    'src/pages/Contacts/Contacts.jsx',
    'src/pages/Dashboard/Dashboard.jsx',
    'src/pages/MassMessage/MassMessage.jsx',
    'src/pages/Chat/Chat.jsx'
]

mapping = {
    'Link': 'Link as LinkIcon',  # To avoid conflict with react-router-dom Link
    'BrainCircuit': 'Microchip',
    'Wand2': 'MagicEdit', # MagicEdit was found earlier
    'Tag': 'Label',       # Label was found earlier
    'Alert': 'WarningBox', # Need to check WarningBox or InfoBox
    'Paperclip': 'Attachment' # Attachment was found earlier
}

for file in files:
    with open(file, 'r') as f:
        content = f.read()

    # DashboardLayout specific fix
    if 'DashboardLayout' in file:
        content = content.replace("<Link size", "<LinkIcon size")
        
    for k, v in mapping.items():
        if k in content:
             content = content.replace(f" {k},", f" {v},").replace(f", {k} ", f", {v} ").replace(f", {k}", f", {v}")

    with open(file, 'w') as f:
        f.write(content)
print("Updated missing icons")
