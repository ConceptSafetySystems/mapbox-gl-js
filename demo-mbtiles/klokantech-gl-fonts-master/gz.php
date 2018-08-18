<?php
function dirToFlatArray($dir)
{
    $result = array();
    $cdir = scandir($dir);
    foreach ($cdir as $key => $value)
    {
        $fullPath = $dir . DIRECTORY_SEPARATOR . $value;
        if (!in_array($value, array(".","..")))
        {
            if (is_dir($fullPath))
            {
                $contents = dirToFlatArray($fullPath);
                $result = array_merge($result, $contents);
            }
            else
            {            
                $ext = pathinfo($fullPath, PATHINFO_EXTENSION);
                if ($ext == "zip")
                {
                    $result[] = $fullPath;
                }
            }
        }
    }

    return $result;
}

date_default_timezone_set("Australia/Brisbane");
$inputDir = dirname(__FILE__);

echo "Getting file list from $inputDir\n";
$arr = dirToFlatArray($inputDir);

$x = 1;
foreach ($arr as $src)
{
    $dst = str_replace("..pbfz.zip", ".pbfz.zip", $src);
    rename($src, $dst);    
}