-- Create the private destination before copying existing objects with the Storage API.
INSERT INTO storage.buckets(id,name,public,file_size_limit)
VALUES('cardrove-media','cardrove-media',false,50000000)
ON CONFLICT(id) DO NOTHING;
